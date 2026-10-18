# Empty states for first-run users

Policies: research, implementation

## Objective

Decide what a brand-new user sees on each page before they have any data, and ship the copy and layout.

## Original Request

"New accounts land on blank tables. Give them somewhere to start."

## Investigation Log

- Listed every page that renders a table or list: projects, members, exports.
- Two pages already show a spinner forever when the list is empty.

## Evidence

- Session recordings: most first-run users leave the projects page within a minute.

## Current Findings

- One shared empty-state component covers all three pages.

## Remaining Questions

- Should the members page invite by email from the empty state?

## Next Actions

1. Build the shared component with an action slot.
2. Replace the spinner-forever cases first.

## Final Conclusions

Pending.
