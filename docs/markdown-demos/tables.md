# Tables demo

## Alignment and inline content

| Surface     | Input                    | Expected result                    |
| :---------- | :----------------------: | ---------------------------------: |
| Inline      | `**strong**`             | **Strong prose**                   |
| Code        | `` `const value = 1` ``  | Inline code                        |
| Link        | `[Design](../DESIGN.md)` | [Design](../DESIGN.md)             |
| Local media | A relative image path    | Project image                      |

## Long cells

| Item | Description | State |
| --- | --- | --- |
| Reader | A long table cell should wrap without stacking a header one character per line or moving the entire document while the cell is edited. | Active |
| Raw Mode | The delimiter row and pipe notation should return without changing the source. | Available |

## Compact values

| A | B | C | D |
| --- | --- | --- | --- |
| 1 | 2 | 3 | 4 |
| 5 | 6 | 7 | 8 |
