# Search index rollout

## Objective

Replace the full-table scan behind search with an index, without a write freeze.

## Investigation Log

- Built the index in the background and dual-wrote for a day (#14).
- Checked the rollout against `verification.md` before asking for review.

## Remaining Questions

- None open.

## Next Actions

- Owner review of #14.

## Final Conclusions

The index builds online in under ten minutes on production-sized data and cuts p95 search time from 1.8 s to 40 ms. Dual writes stay on until #14 merges.
