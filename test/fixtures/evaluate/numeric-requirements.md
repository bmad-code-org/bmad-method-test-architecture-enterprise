# Numeric amount command

The command receives one JSON object on stdin. `amount` must be a finite number. For a non-number amount, it writes `error: invalid amount` to stdout and exits zero. For a finite number, it writes `accepted amount: <value>` to stdout and exits zero.
