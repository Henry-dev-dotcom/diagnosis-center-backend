# Clinician queue result-priority summary

## Contract

`GET /api/encounters/queue` adds an optional `resultPriority` field to entries in `reviewReady`. Existing queue fields, bucket counts, access checks, and ordering remain unchanged.

| Value | Meaning |
|---|---|
| `CRITICAL` | At least one parameter in the latest signed-off lab result has the persisted `CRITICAL` flag. |
| `ABNORMAL` | No critical flag is present, and at least one parameter has a persisted `LOW` or `HIGH` flag. |
| `NORMAL` | Every live, completed order item has a signed-off lab result with at least one parameter, and every parameter is flagged `NORMAL`. |
| `UNCLASSIFIED` | There are no live completed results, a current result/parameter is missing, an item is not a lab result, or any parameter is `NO_RANGE`/`PENDING`. |

A known critical or abnormal flag remains visible even when another item is unclassified. Cancelled orders and items are ignored. For each order item, the summary reads only the most recent signed-off lab result.

## Data and safety boundary

The backend returns only the summary enum. It does not add lab values, parameter names, reference ranges, or raw flag arrays to the queue payload. It does not calculate new cutoffs, mutate result records, reorder the queue, send notifications, or make autonomous clinical decisions. Detailed result review remains in the encounter workspace.

The summary reflects the flags already stored by the laboratory workflow; it is not an independent validation of the facility reference-range configuration or analyzer mapping. A clinical owner should verify those configurations and confirm that this badge is a visual review cue before operational rollout. Any future escalation or notification behavior requires a separately agreed contract.

## Compatibility and rollout

The field is additive and is returned only to `DOCTOR` and `ADMIN` queue viewers; existing route authorization and tenant scoping remain in force. Older clients ignore it. The paired frontend displays a badge only when the field is present and never derives priority from patient values. Both changes should be reviewed and released together; neither branch has been merged or deployed as part of this implementation.
