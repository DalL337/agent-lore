# Cache eviction under memory pressure

## Objective

Find out why the cache evicts hot entries first when memory is tight.

## Investigation Log

- Reproduced with a synthetic workload; eviction order looks inverted.

## Remaining Questions

- Is the access counter reset on every read?

## Next Actions

1. Read the eviction loop again with the counter in mind.
