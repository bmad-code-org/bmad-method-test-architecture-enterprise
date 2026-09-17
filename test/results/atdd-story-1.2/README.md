# Story 1.2 ATDD evidence

This directory preserves the evidence used to remediate Story 1.2.

`pre-change-diagnostics.json` binds the two reconstructed repetition diagnostics to the protected
1.27.1 live result by commit and SHA-256 digest. Its replay links are deterministic witnesses for
the observed failure classes. They are diagnostic reproductions, not replacements for the live
record.

Post-fix live evidence is added as a new immutable file after the implementation commit is measured.
The file name includes the measured commit. The live harness remains the producer of its contents.
