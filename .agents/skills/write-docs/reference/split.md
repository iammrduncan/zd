# split

Propose a split when a page has become two documents joined together.

`split` proposes. It does not perform the split unless asked — the boundary is a judgement about
readers, and getting it wrong creates two bad pages from one.

## When a page needs splitting

Not merely when it is long. When it **serves two readers, or one reader on two occasions**:

- a first-timer and someone mid-task;
- a task and the concept behind it;
- a procedure and the full parameter list.

The test: describe the page's reader in one sentence. If the sentence needs "or", it is two pages.

A long page with one reader and one type is not a split candidate. It is possibly a badly organised
page — that is [audit.md](audit.md).

## Procedure

### 1. Name both readers

Say who each page would serve and what each needs when they leave. If you cannot describe both
distinctly, there is only one page and the problem is elsewhere.

### 2. Assign the type of each

Run [classify.md](classify.md) on each half. A split almost always produces two *different* types —
that is usually what went wrong in the first place. Two halves of the same type suggests the page
just needs reorganising.

### 3. Find where the reader changes

That point is usually visible: a heading where the tone shifts from doing to explaining, or where
the assumed knowledge jumps.

Content that belongs to both halves is the hard part. **Put it on the page that cannot be understood
without it, and link from the other.** Do not duplicate it — two copies diverge, and the reader who
finds the stale one has no way to know.

### 4. Propose

State:

- the two pages, each with its type, its reader, and a title in the reader's words;
- where the page divides, quoted;
- what content is shared, which page owns it, and where the link goes;
- what is lost by splitting — usually the reader who genuinely wanted both, and how the links
  address them;
- anything that belongs to neither page and should be cut.

### 5. Stop

Wait for agreement before writing either page. A split is cheap to discuss and expensive to reverse
once two pages exist and other documents link to them.

## Do not

- Do not duplicate shared content into both pages.
- Do not split into more than two without saying why; three-way splits usually mean the original had
  no reader at all.
- Do not delete anything during a split. Content nobody wants is a separate finding.
