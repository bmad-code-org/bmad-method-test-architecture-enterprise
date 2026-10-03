param([Parameter(Mandatory = $true)][int]$GuardianPid)

$ErrorActionPreference = 'Stop'

function Write-Trace([string]$Stage) {
    if (-not $env:TEA_WINDOWS_JOB_TRACE) { return }
    try {
        $line = "{0} powershell {1} {2}`n" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(), $PID, $Stage
        [System.IO.File]::AppendAllText($env:TEA_WINDOWS_JOB_TRACE, $line)
    } catch { }
}

Write-Trace 'helper-enter'
Write-Trace "helper-runtime ps=$($PSVersionTable.PSVersion) edition=$($PSVersionTable.PSEdition) clr=$([Environment]::Version) temp=$([bool]$env:TEMP) tmp=$([bool]$env:TMP) systemroot=$([bool]$env:SystemRoot) windir=$([bool]$env:windir) userprofile=$([bool]$env:USERPROFILE)"
if ($env:TEA_WINDOWS_JOB_OWNER_TEST_FAILURE -eq 'stderr-exit') {
    [Console]::Error.WriteLine('forced helper stderr before readiness')
    exit 17
}
$addTypeStarted = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Write-Trace 'helper-add-type-start'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class TeaWindowsJob {
    [StructLayout(LayoutKind.Sequential)]
    public struct BasicLimitInformation {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct IoCounters {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct ExtendedLimitInformation {
        public BasicLimitInformation BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr CreateJobObject(IntPtr securityAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetInformationJobObject(IntPtr job, int informationClass,
        ref ExtendedLimitInformation information, uint length);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr handle);
}
'@
Write-Trace "helper-add-type-done elapsed-ms=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $addTypeStarted)"

$job = [IntPtr]::Zero
$guardian = [IntPtr]::Zero
try {
    if ($env:TEA_WINDOWS_JOB_OWNER_TEST_FAILURE -eq '1') {
        throw 'forced Windows Job Object setup failure'
    }

    $job = [TeaWindowsJob]::CreateJobObject([IntPtr]::Zero, $null)
    Write-Trace "helper-job-created handle=$job"
    if ($job -eq [IntPtr]::Zero) {
        throw "CreateJobObject failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }

    $limits = [TeaWindowsJob+ExtendedLimitInformation]::new()
    $basic = [TeaWindowsJob+BasicLimitInformation]::new()
    $basic.LimitFlags = 0x2000 # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    $limits.BasicLimitInformation = $basic
    $size = [Runtime.InteropServices.Marshal]::SizeOf([type][TeaWindowsJob+ExtendedLimitInformation])
    if (-not [TeaWindowsJob]::SetInformationJobObject($job, 9, [ref]$limits, [uint32]$size)) {
        throw "SetInformationJobObject failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
    Write-Trace 'helper-kill-on-close-set'

    $guardian = [TeaWindowsJob]::OpenProcess(0x101, $false, $GuardianPid) # PROCESS_TERMINATE | PROCESS_SET_QUOTA
    Write-Trace "helper-guardian-opened handle=$guardian"
    if ($guardian -eq [IntPtr]::Zero) {
        throw "OpenProcess failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
    $assignedProcess = if ($env:TEA_WINDOWS_JOB_OWNER_TEST_FAILURE -eq 'assign') { [IntPtr]::Zero } else { $guardian }
    if (-not [TeaWindowsJob]::AssignProcessToJobObject($job, $assignedProcess)) {
        throw "AssignProcessToJobObject failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
    Write-Trace 'helper-guardian-assigned'
    if ($env:TEA_WINDOWS_JOB_OWNER_TEST_FAILURE -eq 'after-assign') {
        throw 'forced failure after Job Object assignment'
    }
    if ($env:TEA_WINDOWS_JOB_OWNER_TEST_FAILURE -eq 'ready-delay') {
        Start-Sleep -Milliseconds 5000
    }

    [Console]::Out.WriteLine('READY')
    [Console]::Out.Flush()
    Write-Trace 'helper-ready-written'
    [Console]::In.ReadToEnd() | Out-Null
} catch {
    Write-Trace "helper-error $($_.Exception.Message)"
    [Console]::Out.WriteLine("ERROR $($_.Exception.Message)")
    [Console]::Out.Flush()
    [Console]::In.ReadToEnd() | Out-Null
    exit 1
} finally {
    Write-Trace 'helper-closing-handles'
    if ($guardian -ne [IntPtr]::Zero) { [TeaWindowsJob]::CloseHandle($guardian) | Out-Null }
    if ($job -ne [IntPtr]::Zero) { [TeaWindowsJob]::CloseHandle($job) | Out-Null }
}
