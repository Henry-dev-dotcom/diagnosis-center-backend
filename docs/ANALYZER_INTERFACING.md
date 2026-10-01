# Analyzers that file their own results

A laboratory that has bought a chemistry or haematology analyzer has already paid
for the numbers once. Typing them into LHIMS a second time costs time and
introduces the one error that is hardest to catch: a correct measurement entered
against the wrong patient, or with a digit transposed.

This is how an instrument files its own results instead.

## The three rules

Everything in this feature follows from three rules. They are worth stating first,
because most of the design exists to keep them true.

**1. A machine never releases a result.** Values arrive as a **draft** on the
bench, or — if the facility sets the analyzer that way — in the **review queue**.
A person signs off, always. There is no setting that changes this, and no path
through the code that signs a result off without a user.

**2. A machine never guesses.** A test code the facility has not mapped, a
specimen id matching no sample, a value belonging to a test that was not ordered:
each is set aside with a reason in plain words, never approximated into the
nearest-looking field. A wrong number in the right-looking box is worse than a
missing one.

**3. Nothing is lost.** The payload is stored *verbatim* before anything tries to
understand it. A message that failed to parse, match or map is still there, and
can be replayed once the cause is fixed. A sample may not be repeatable; a
message always is.

## Getting an instrument connected

### 1. Register it

**Laboratory → Analyzers → Register an analyzer.** Give it a name the bench will
recognise, and say how it sends results:

| Protocol | What it is | Typical instruments |
| --- | --- | --- |
| **HL7 v2** | `ORU^R01` observation messages | Most modern analyzers, and nearly all vendor middleware |
| **ASTM** | ASTM E1381/E1394 records | Older analyzers on a serial cable |
| **Export file (CSV)** | A delimited file the instrument writes | Anything with a "save results" or "export" function |
| **JSON** | Our own simple shape | A custom or in-house integration |

Saving issues the analyzer a **key**, shown once. It is stored only as a bcrypt
hash, so nobody — including us — can read it back. If it is lost, issue a new one;
the old one stops working the moment the new one exists.

### 2. Get the results to us

Three ways, in order of how much setting up they need.

**Upload the file.** No installation at all. Export the run from the instrument
and bring the file to **Analyzers → Upload a run**. Good for a small lab, and for
proving the mapping is right before automating anything.

**Run the bridge.** `tools/analyzer-bridge/` is a single dependency-free Node
script that runs on the computer beside the analyzer. It either watches a folder
the instrument writes to, or listens for the instrument to connect and push
messages. See its [README](../tools/analyzer-bridge/README.md).

**Post directly.** Any software that can make an HTTPS request can send to the
ingestion endpoint itself:

```
POST /api/integrations/analyzers/results
X-Analyzer-Key: lhims_anz_<prefix>_<secret>
Content-Type: text/plain

<the instrument's own payload, unchanged>
```

The body is taken as raw text, so an HL7 or ASTM message needs no wrapping. The
reply is **202 Accepted** with a summary — the payload was stored, and the body
says what was made of it:

```json
{
  "success": true,
  "message": "3 value(s) stored as a draft result awaiting your check.",
  "data": { "messageId": "...", "status": "APPLIED", "applied": 3, "skipped": 0, "notes": [] }
}
```

`202` rather than `200` is deliberate: storing always succeeds, applying may not,
and a bridge must not retry forever over a mapping gap only a person can close.

### 3. Tell us what its codes mean

**This is the step that matters.** Run one sample. Whatever codes the instrument
actually used now appear under **Analyzers → Test mapping**, with an example
value, waiting to be pointed at one of your own test fields. Map them, then
**replay** the message from the analyzer log to bring the values in.

Many instruments need no mapping at all. A code that already matches one of your
field names (`WBC`, `Platelets`) is recognised on its own, as is a code matching a
single-parameter test's own name or alias (`Glucose`, `FBS`).

Where units differ, put a **conversion factor** on the mapping — glucose in mg/dL
against our mmol/L is `0.0555`. The instrument's untouched reading is always kept
beside the converted value, so the conversion can be checked.

## How a reading finds its patient

By the **specimen id**, and only by the specimen id. The analyzer must be given
the sample code printed on the tube — `SMP-0007`, or whatever barcode you recorded
against the sample. Nothing is matched by patient name, date of birth, or
position in a worklist.

If the analyzer also sends a patient id and it does not match the sample's
patient, the values are still stored and a warning is attached to the message:
that pattern almost always means the wrong label went on the tube, and the bench
needs to know before signing anything off.

One run can cover several of your tests. If a mapped code belongs to a different
catalog item that was ordered on the same order, the value goes to that test's own
sample.

## Flagging

Flags come from **your** reference ranges, never the analyzer's. A value that
would be called critical when typed is called critical when it arrives down a
cable; the same function decides both (`src/services/labFlags.ts`).

The analyzer's own abnormal marker (`H`, `L`, `HH`) is read **only** where you
have no range for that field — so a value is never left unflagged when the
instrument knew something — and never overrides a flag your ranges produced. The
instrument does not know this facility's population or its cut-offs.

A **critical** value notifies the laboratory immediately, while the result is
still a draft nobody outside the lab can see. An analyzer filing a panic value at
two in the morning with nobody watching the screen is the real risk in automating
this, and that notification is the answer to it.

## What an analyzer cannot do

- **Overwrite a result that has been signed off.** It is set aside with a message
  saying to withdraw the result first. Withdrawal is a deliberate, audited act by
  a person (see `reverseLabResult`).
- **Touch a rejected sample**, or a cancelled result.
- **Replace a value a technician typed that the instrument does not measure.** A
  manual comment or differential stays exactly as it was; only the fields the
  analyzer sent are replaced.
- **Reach another facility.** The device key identifies one facility, and
  everything downstream runs in that facility's tenant context, with the database
  same-facility triggers underneath it.
- **Be attributed to a person.** `enteredById` is left null. Recording a
  technician as having entered a value they never saw would be a false attribution
  on a clinical record.

## Security

- The key is `lhims_anz_<prefix>_<secret>`, both halves hex. The prefix is public
  and globally unique, so authentication is one indexed lookup; the whole key is
  verified against a bcrypt hash at cost 12.
- Verification runs even when no device matches the prefix, so a wrong prefix and
  a wrong secret take the same time to answer.
- A device key authenticates **only** the ingestion endpoint. It cannot read
  anything, cannot list patients, and cannot reach any other route.
- Rotating a key invalidates the old one immediately. Disabling the analyzer stops
  it sending at once (`403`).
- Setting analyzers up needs `lab:analyzers:manage`, held by laboratory staff and
  administrators. Reception, billing and clinicians get `403`.
- An unpaid facility is read-only for its staff, but an analyzer may still file
  what it measured. Refusing would throw away a run on a sample that may no longer
  be viable, and nothing filed can reach a patient without a sign-off that the
  read-only rule already blocks.
- Every payload, every applied result, every key rotation and every discarded
  message is in the audit log.

## Where the code is

| Path | What it does |
| --- | --- |
| `src/services/analyzer/parsers.ts` | HL7, ASTM, CSV and JSON into one shape. Pure text handling, no database — tested against captured messages in `test/analyzerParsers.test.ts`. |
| `src/services/analyzer/ingest.service.ts` | Matching a reading to a sample, resolving codes to fields, and writing the draft result. |
| `src/services/analyzer/device.service.ts` | Devices, keys, mapping, the message log, replay and the file upload. |
| `src/middleware/analyzerAuth.ts` | How a device proves who it is. |
| `src/services/labFlags.ts` | The one flagging rule, shared with manual entry. |
| `tools/analyzer-bridge/` | The on-premise collector. |
| `test/integration/analyzerIngest.test.ts` | The three rules, as tests. |

## Troubleshooting

| What the bench sees | What it means |
| --- | --- |
| *"No accepted sample matches …"* | The specimen id is not a sample code or recorded barcode. Check the tube, or accept the sample first, then replay. |
| *"… is not mapped to a test"* | Map the code under Test mapping, then replay the message. |
| *"… has already been signed off and sent"* | Withdraw the result from Lab Results first. |
| *"… map to X, which was not ordered"* | The mapping points at a test that is not on this patient's order. Either the order is incomplete or the mapping is wrong. |
| Status **FAILED**, error mentioning `MSH` | The instrument is sending a different dialect to the one it is registered with. Change its protocol, or fix the instrument's output setting. |
| Nothing arrives at all | Check the bridge's log. A `401` means the key was rotated; a `403` means the analyzer was disabled or the Laboratory module is off. |
