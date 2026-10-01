# LHIMS analyzer bridge

Analyzers sit on a bench, on a serial cable or a local network. LHIMS is in the
cloud. This is the small program that stands between them.

It runs on any computer in the laboratory that can see the analyzer and reach the
internet — the PC the instrument's own software already runs on is usually the
right one. It needs **Node 18 or later** and nothing else: no `npm install`, no
build step, one file.

## Setting it up

1. In LHIMS, go to **Laboratory → Analyzers** and register the instrument. Copy
   the key it shows you. That is the only time it is shown.
2. Copy `bridge.config.example.json` to `bridge.config.json` and fill in `apiUrl`
   and `deviceKey`.
3. Run it:

   ```
   node bridge.mjs --config bridge.config.json
   ```

Keep `bridge.config.json` readable only by the account that runs the bridge: it
holds the analyzer's key. Every setting can also come from the environment
(`LHIMS_API_URL`, `LHIMS_DEVICE_KEY`, `LHIMS_BRIDGE_MODE`, `LHIMS_WATCH_DIR`,
`LHIMS_BRIDGE_PORT`), which suits a service manager better than a file.

## The two modes

### `folder` — watch a directory (prefer this)

The analyzer, or its own software, saves results to a folder. The bridge picks
each file up and posts it.

```json
{ "mode": "folder", "watchDir": "C:/LHIMS/analyzer/incoming" }
```

Prefer this where the instrument allows it. The file is proof of what was
measured, and nothing is lost if the bridge happens not to be running: it catches
up when it starts.

Three folders are created inside `watchDir`:

| Folder | What is in it |
| --- | --- |
| `sent/` | LHIMS has stored it. Keep or archive these. |
| `queue/` | Could not be delivered yet — network down, key rotated. Retried automatically. |
| `failed/` | LHIMS read the request and refused it. A `.why.txt` beside each file says why. These need a person. |

A file is only read once its size has stopped changing, so a run the instrument is
still writing is left alone.

### `tcp` — listen for the analyzer

Most HL7 and ASTM instruments are configured to connect out and push messages.

```json
{ "mode": "tcp", "host": "0.0.0.0", "port": 9100 }
```

Point the analyzer at this machine's address and port. HL7 is read as MLLP frames
and **acknowledged** (`MSA|AA`, or `MSA|AE` if LHIMS could not take it) — an
instrument that gets no ACK will usually alarm or resend. ASTM and unframed
senders are read as whole transmissions, ending when the line goes quiet.

A TCP message has no other copy, so anything that cannot be delivered is written
into `watchDir`'s `queue/` folder and retried. Set `watchDir` in this mode too.

## Keeping it running

It is an ordinary long-running process; use whatever the lab's computer already
has.

**Windows** — with [NSSM](https://nssm.cc/):

```
nssm install LhimsAnalyzerBridge "C:\Program Files\nodejs\node.exe" "C:\LHIMS\bridge\bridge.mjs --config C:\LHIMS\bridge\bridge.config.json"
nssm set LhimsAnalyzerBridge AppStdout C:\LHIMS\bridge\bridge.log
nssm set LhimsAnalyzerBridge AppStderr C:\LHIMS\bridge\bridge.log
nssm start LhimsAnalyzerBridge
```

**Linux** — a systemd unit:

```ini
[Unit]
Description=LHIMS analyzer bridge
After=network-online.target

[Service]
ExecStart=/usr/bin/node /opt/lhims-bridge/bridge.mjs --config /opt/lhims-bridge/bridge.config.json
Restart=always
RestartSec=10
User=lhims

[Install]
WantedBy=multi-user.target
```

## Reading the log

Every line is timestamped. The ones that matter:

```
[info]  sent run001.hl7: 3 value(s) stored as a draft result awaiting your check.
[error] will retry run002.hl7: could not reach LHIMS: fetch failed
[error] giving up on run003.csv: LHIMS answered 422: ...
```

- **sent** — it is in LHIMS. Whether every value landed on a result is shown in
  the same line, and in full under **Analyzers → Analyzer log**.
- **will retry** — the network, or a key that was rotated, or LHIMS being
  restarted. It keeps trying; no action needed unless it persists.
- **giving up** — LHIMS refused the request itself. Look at the `.why.txt` in
  `failed/`. The usual cause is the instrument sending a different dialect to the
  one it is registered with.

A message that reached LHIMS but could not be filed — an unmapped code, a specimen
id matching no sample — is **not** an error here. It is stored, and it is waiting
for someone in **Analyzers → Analyzer log**, where it can be replayed once the
cause is fixed.

## Checking it works

Before involving the instrument, send a file by hand. Write a small CSV naming a
sample you have actually accepted:

```csv
sample,test,value,unit,flag
SMP-0007,Glucose,5.4,mmol/L,N
```

Drop it in the watch folder with the device registered as **Export file (CSV)**.
Within a few seconds the log should say it was sent, and the value should be on
that sample's draft result in LHIMS.

See [docs/ANALYZER_INTERFACING.md](../../docs/ANALYZER_INTERFACING.md) for how
mapping, flagging and matching work on the LHIMS side.
