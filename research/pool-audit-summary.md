# Full-Pool Audit Summary (`auditor-v3-pool`)

- **Raw deduplicated pool:** `3800` works (`2894` full-text windows retrieved, `906` abstract-only)
- **Explorer total (`17` curated landmarks + deduplicated pool):** `3779` works
- **Checked scope (`RH + Dirichlet GRH`, full explorer `N = 3779`):**
  - Newly unconditional (`UPGRADED_UNCONDITIONAL`): `393`
  - Faster / tighter or already proven (`BOUND_TIGHTENED`): `643`
  - Still conditional (`STILL_CONDITIONAL` — `BEYOND_DIRICHLET` + `UNCLEAR`): `1170`
  - Retired counterfactuals (`VACUOUS_OR_SUPERSEDED`): `44`
  - Passing mentions unchanged (`MENTION_ONLY_UNCHANGED`): `1529`
- **Top-100 most-cited works (`N = 100`):**
  - Newly unconditional: `6` | Faster/already proven: `21` | Still conditional: `27` | Retired: `2` | Mention-only: `44`

## Conjecture Breakdown

| Conjecture Class | Full Explorer (`N = 3779`) | Top 100 (`N = 100`) |
| --- | ---: | ---: |
| `RH` | 533 | 10 |
| `GRH_DIRICHLET` | 477 | 14 |
| `BEYOND_DIRICHLET` | 1035 | 26 |
| `UNCLEAR` | 135 | 1 |
| `DENSITY_BOUND` | 70 | 5 |
| `MENTION_ONLY` | 1529 | 44 |

## Top 25 Most-Cited Papers in the Pool

| Cites | Year | Authors | Title | Class | Checked Verdict |
| ---: | ---: | --- | --- | --- | --- |
| 6681 | 1987 | Neal Koblitz | Elliptic Curve Cryptosystems | `MENTION_ONLY` | Only Mentions It |
| 1371 | 2004 | Manindra Agrawal, Neeraj Kayal, Nitin Saxena | PRIMES is in P | `MENTION_ONLY` | Only Mentions It |
| 980 | 1967 / 1973 | Christopher Hooley; Peter J. Weinberger | On Artin's conjecture (Hooley 1967) & Euclidean rings of algebraic integers (Weinberger 1973) | `BEYOND_DIRICHLET` | Still Needs Number-Field ERH |
| 890 | 1990 | Gary L. Miller (1976), Eric Bach (1990) | Explicit bounds for primality testing and related problems | `GRH_DIRICHLET` | Gets Faster / Tighter |
| 889 | 2000 | Jonathan P. Keating, N. C. Snaith | Random Matrix Theory and ζ(1/2+ it) | `MENTION_ONLY` | Only Mentions It |
| 674 | 2018 | Salvatore Torquato | Hyperuniform states of matter | `MENTION_ONLY` | Only Mentions It |
| 562 | 2009 | David Mandell Freeman, Michael Scott, Edlyn Teske | A Taxonomy of Pairing-Friendly Elliptic Curves | `GRH_DIRICHLET` | Gets Faster / Tighter |
| 540 | 1976 | Lowell Schoenfeld | Sharper bounds for the Chebyshev functions theta(x) and psi(x). II | `RH` | Gets Faster / Tighter |
| 506 | 2010 | Ben Green, Terence Tao | Linear equations in primes | `MENTION_ONLY` | Only Mentions It |
| 494 | 2007 | Denis Xavier Charles, Kristin Lauter, Eyal Z. Goren | Cryptographic Hash Functions from Expander Graphs | `MENTION_ONLY` | Only Mentions It |
| 482 | 1999 | Henryk Iwaniec, Wenzhi Luo, Peter Sarnak | Low lying zeros of families of L-functions | `BEYOND_DIRICHLET` | Still Needs Number-Field ERH |
| 420 | 1984 | Guy Robin | Grandes valeurs de la fonction somme des diviseurs et hypothese de Riemann | `RH` | Machine-Checked in Lean 4 |
| 375 | 1993 | Adolf Hildebrand, Gérald Tenenbaum | Integers without large prime factors | `MENTION_ONLY` | Only Mentions It |
| 356 | 2000 | Ronald Cramer, Victor Shoup | Signature schemes based on the strong RSA assumption | `MENTION_ONLY` | Only Mentions It |
| 334 | 1901 | Helge von Koch | Sur la distribution des nombres premiers | `RH` | Gets Faster / Tighter |
| 327 | 2013 | Andrew M. Childs, David Jao, Vladimir Soukharev | Constructing elliptic curve isogenies in quantum subexponential time | `BEYOND_DIRICHLET` | Still Needs Number-Field ERH |
| 325 | 2006 | K. Soundararajan | Moments of the Riemann zeta-function | `RH` | Becomes Proven |
| 313 | 1994 | Michael Rubinstein, Peter Sarnak | Chebyshev's Bias | `BEYOND_DIRICHLET` | Still Needs Number-Field ERH |
| 310 | 2002 | Jeffrey C. Lagarias | An Elementary Problem Equivalent to the Riemann Hypothesis | `RH` | Machine-Checked in Lean 4 |
| 290 | 2000 | K. Soundararajan | Nonvanishing of Quadratic Dirichlet L-Functions at S = ½ | `DENSITY_BOUND` | Already Proven |
| 285 | 2013 | Tomas Antonio Mendes Oliveira e Silva, Siegfried Herzog, Silvio Pardi | Empirical verification of the even Goldbach conjecture and computation of prime gaps up to 4⋅10¹⁸ | `MENTION_ONLY` | Only Mentions It |
| 280 | 2005 / 2009 | David Jao, Stephen D. Miller, Ramarathnam Venkatesan | Do All Elliptic Curves of the Same Order Have the Same Difficulty of Discrete Log? (Expander graphs based on GRH) | `BEYOND_DIRICHLET` | Still Needs Number-Field ERH |
| 271 | 2002 | Emmanuel Kowalski, Philippe Michel, Jeffrey M. VanderKam | Rankin-Selberg L-functions in the level aspect | `MENTION_ONLY` | Only Mentions It |
| 261 | 2002 | David Rodney Heath-Brown | The Density of Rational Points on Curves and Surfaces | `MENTION_ONLY` | Only Mentions It |
| 241 | 1986 | Shafi Goldwasser, Joe Kilian | Almost all primes can be quickly certified | `MENTION_ONLY` | Only Mentions It |
