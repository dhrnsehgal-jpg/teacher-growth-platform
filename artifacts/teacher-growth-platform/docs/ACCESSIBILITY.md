# Accessibility

**Target: WCAG 2.2 Level AA.**

This is a statement of what was tested and what was found, not a conformance
claim. Automated testing finds perhaps a third of accessibility defects. The
rest need a person, and some need a person who actually uses the technology.

---

## How it is verified

`tests/e2e/accessibility.spec.ts` runs axe-core against **21 pages across five
roles** — signed out, teacher, manager, leadership, and compliance administrator —
tagged `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`. Zero violations.

Pages a teacher never sees are the ones that get tested least, so every role is
covered rather than just the teacher's view.

Beyond axe, which cannot check these:

| Check                                                                                                     | Criterion     |
| --------------------------------------------------------------------------------------------------------- | ------------- |
| The first Tab reaches "Skip to main content", and activating it focuses the content                       | 2.4.1         |
| Navigation carries `aria-current="page"` on the current page                                              | 1.3.1         |
| Every page has a distinct title                                                                           | 2.4.2         |
| No sideways page scroll at 320px on five representative pages                                             | 1.4.10        |
| No text clipped when line height goes to 1.5×, paragraph spacing to 2×, and letter and word spacing widen | 1.4.12        |
| Every colour pair recomputed from the stylesheet against its required ratio                               | 1.4.3, 1.4.11 |

Contrast is locked by a unit test (`tests/unit/contrast.test.ts`, 18 assertions)
that parses the palette out of `globals.css` and recomputes each ratio. A future
palette change has to meet the arithmetic rather than someone's eye.

---

## Measured contrast

| Pair                               | Light   | Dark    | Required |
| ---------------------------------- | ------- | ------- | -------- |
| Body text on background            | 17.90:1 | 17.23:1 | 4.5      |
| Secondary text on background       | 6.08:1  | 7.36:1  | 4.5      |
| Secondary text on a chip           | 5.54:1  | 6.12:1  | 4.5      |
| Text on a chip                     | 16.31:1 | 14.34:1 | 4.5      |
| Verification warning text          | 7.81:1  | 10.20:1 | 4.5      |
| Inverted text on the critical band | 17.90:1 | 17.23:1 | 4.5      |
| Form control border                | 3.09:1  | 3.10:1  | 3.0      |
| Focus indicator                    | 17.90:1 | 11.19:1 | 3.0      |

The form control border was at **1.34:1** — effectively invisible, and nobody
would have caught it by looking. It is now the lightest value on that hue that
clears 3:1, chosen by measurement.

Decorative card borders remain soft. A card edge is decoration; 1.4.11 applies
to boundaries needed to identify a control.

---

## Defects found and fixed

Nine, all found by measurement rather than inspection:

1. **No bypass link.** Twenty navigation links precede the content of every
   page, so a keyboard user tabbed through all of them on every navigation.
   (2.4.1)
2. **Control borders at 1.34:1**, where 3:1 is required to identify an input at
   all. (1.4.11)
3. **Twenty-five routes shared one page title.** (2.4.2)
4. **Progress conveyed by colour alone** in three places — plan-stage pips,
   learning milestones, appraisal steps. All three now say the state in words.
   (1.4.1)
5. **A form refusal was distinguished from success only by colour.** It now says
   "Not done" and is announced assertively rather than politely. (1.4.1, 4.1.3)
6. **Fifty-six column headers without `scope`.** (1.3.1)
7. **The analytics heatmap scrolled sideways but took no focus**, so a keyboard
   user could not reach the columns past the fold. All thirteen scroll regions are
   now focusable and named. (2.1.1)
8. **The page scrolled sideways at 320px**, taking every line of text off-screen
   with it — grid items default to `min-width: auto` and refuse to shrink.
   (1.4.10)
9. **No focus indicator beyond the browser default**, which is nearly invisible
   on the dark primary buttons. (2.4.7)

---

## Design decisions that carry accessibility weight

**The compliance ring writes its figure in the middle as text.** An arc conveys
nothing to a screen reader and little to anyone judging angles. The ring is
decoration over a number, which is the right way round.

**The progress bar states its numbers.** A compliance figure that can only be
read by eyeballing a bar's width is not a compliance figure.

**Labels use `htmlFor`/`id` rather than wrapping the control.** A wrapped
`<select>` takes its accessible name from the label's entire text content,
including the selected option — so "Level" becomes "Level 4 — Advanced", and the
name changes as the value changes.

**The dashboard answers questions in sentences.** The brief asked for eight
questions to be answerable at a glance. Four counters were replaced with eight
sentences: a number is not an answer, and this helps everyone, not only users of
assistive technology.

**The assess-a-teacher page has a deliberately generic title.** A colleague's
name does not belong in a window title, a browser history entry, or a
screenshot.

---

## WCAG 2.2 additions specifically

| Criterion                                 | Position                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2.4.11 Focus Not Obscured (Minimum)       | Pass — no sticky or fixed overlays                                                                                      |
| 2.5.7 Dragging Movements                  | Not applicable — no drag interactions                                                                                   |
| 2.5.8 Target Size (Minimum)               | Pass — navigation links given vertical padding to clear 24px unambiguously rather than relying on the spacing exception |
| 3.2.6 Consistent Help                     | Not applicable — no help mechanism exists. Worth adding with one.                                                       |
| 3.3.7 Redundant Entry                     | Pass                                                                                                                    |
| 3.3.8 Accessible Authentication (Minimum) | Pass — password managers supported via `autocomplete`, paste not blocked, no cognitive test                             |

---

## Not tested, and honestly so

This is the part that matters most.

| Not tested                                                   | Why it matters                                                                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Any real screen reader** — NVDA, JAWS, VoiceOver, TalkBack | axe checks markup, not experience. Reading order, verbosity and whether the eight-question dashboard is actually usable aurally are unknown.                                   |
| **Any real assistive-technology user**                       | The most important gap on this list.                                                                                                                                           |
| Voice control (Dragon, Voice Control)                        | Visible labels should support it; unverified.                                                                                                                                  |
| Screen magnification at 400%                                 | 1.4.10 reflow is tested at 320px, which is related but not the same.                                                                                                           |
| Cognitive accessibility                                      | The language was written to be plain, but plain language is not the same as tested comprehension. Teachers in the pilot are the right testers.                                 |
| Regional languages                                           | The interface is English only. Teachers in a Punjab school may reasonably expect Punjabi and Hindi. **This is a real accessibility limitation**, not merely a missing feature. |
| Browsers other than Chromium                                 | Playwright runs Chromium only.                                                                                                                                                 |

---

## What to do next

1. **Test with a real screen reader user.** Nothing on this page substitutes for
   it, and the pilot is the opportunity.
2. **Ask during the pilot** whether anyone uses assistive technology, before
   assuming nobody does.
3. **Plan for Punjabi and Hindi.** The interface strings are not currently
   externalised, so this is real work and should be scoped, not assumed.
4. **Add Firefox and WebKit** to the Playwright projects.

---

## Reporting a problem

If any part of this is unusable for you, tell the school administrator. A
specific description — which page, what you were using, what happened — is worth
more than a general one, and will be treated as a defect rather than a request.
