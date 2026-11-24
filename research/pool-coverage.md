# Pool Coverage Report (Attempt 2 Harvest)

- **Harvest date (UTC):** 2026-11-24
- **Total deduplicated works in pool:** **3,800**
- **Works with arXiv IDs (e-print / HTML retrievable):** 2,377 (62.6%)
- **Works with open-access URL or arXiv ID:** 3,528 (92.8%)
- **Works surfaced via OpenAlex full-text search that were absent from arXiv abstract harvest:** 2,687

## Old 160-Paper Corpus vs. Citation-Ranked Pool

- **Top 100 most-cited works captured in Attempt 1 (160-paper corpus):** **11 / 100** (missed **89 / 100**)
- **Top 500 most-cited works captured in Attempt 1 (160-paper corpus):** **25 / 500** (missed **475 / 500**)

## Per-Source Contribution & Overlap

| Source | Deduplicated Works Found | Exclusive to This Source | Share of Pool |
| --- | ---: | ---: | ---: |
| `arxiv_abstract` | 877 | 207 | 23.1% |
| `openalex_fulltext` | 3,321 | 2,366 | 87.4% |
| `anchor_citations` | 698 | 220 | 18.4% |
| `curated_classics` | 36 | 15 | 0.9% |

## Top 25 Most-Cited Works in the Pool

| Rank | Citations | Year | Authors | Title | Sources | In Attempt 1? |
| ---: | ---: | ---: | --- | --- | --- | :---: |
| 1 | 6,681 | 1987 | Neal Koblitz | Elliptic Curve Cryptosystems | openalex_fulltext, anchor_citations | No |
| 2 | 1,371 | 2004 | Manindra Agrawal, Neeraj Kayal, Nitin Saxena | PRIMES is in P | openalex_fulltext, anchor_citations | No |
| 3 | 980 | 1967 | Christopher Hooley | On Artin's conjecture | curated_classics | Yes |
| 4 | 890 | 1990 | Eric Bach | Explicit bounds for primality testing and related problems | curated_classics, openalex_fulltext, anchor_citations | Yes |
| 5 | 889 | 2000 | Jonathan P. Keating, N. C. Snaith | Random Matrix Theory and ζ(1/2+ it) | openalex_fulltext | No |
| 6 | 863 | 1976 | Gary L. Miller | Riemann's hypothesis and tests for primality | curated_classics, openalex_fulltext, anchor_citations | No |
| 7 | 674 | 2018 | Salvatore Torquato | Hyperuniform states of matter | openalex_fulltext | No |
| 8 | 562 | 2009 | David Mandell Freeman, Michael Scott, Edlyn Teske | A Taxonomy of Pairing-Friendly Elliptic Curves | openalex_fulltext | No |
| 9 | 540 | 1976 | Lowell Schoenfeld | Sharper bounds for the Chebyshev functions theta(x) and psi(x). II | curated_classics | Yes |
| 10 | 506 | 2010 | Ben Green, Terence Tao | Linear equations in primes | curated_classics, openalex_fulltext | No |
| 11 | 494 | 2007 | Denis Xavier Charles, Kristin Lauter, Eyal Z. Goren | Cryptographic Hash Functions from Expander Graphs | openalex_fulltext | No |
| 12 | 482 | 1999 | Henryk Iwaniec, Wenzhi Luo, Peter Sarnak | Low lying zeros of families of L-functions | arxiv_abstract, openalex_fulltext | No |
| 13 | 420 | 1984 | Guy Robin | Grandes valeurs de la fonction somme des diviseurs et hypothese de Riemann | curated_classics | No |
| 14 | 375 | 1993 | Adolf Hildebrand, Gérald Tenenbaum | Integers without large prime factors | openalex_fulltext | No |
| 15 | 356 | 2000 | Ronald Cramer, Victor Shoup | Signature schemes based on the strong RSA assumption | openalex_fulltext | No |
| 16 | 334 | 1901 | Helge von Koch | Sur la distribution des nombres premiers | curated_classics | No |
| 17 | 327 | 2013 | Andrew M. Childs, David Jao, Vladimir Soukharev | Constructing elliptic curve isogenies in quantum subexponential time | curated_classics, arxiv_abstract, openalex_fulltext, anchor_citations | Yes |
| 18 | 325 | 2006 | K. Soundararajan | Moments of the Riemann zeta-function | arxiv_abstract, openalex_fulltext | No |
| 19 | 313 | 1994 | Michael Rubinstein, Peter Sarnak | Chebyshev's Bias | curated_classics, openalex_fulltext | No |
| 20 | 310 | 2002 | Jeffrey C. Lagarias | An Elementary Problem Equivalent to the Riemann Hypothesis | curated_classics, arxiv_abstract, openalex_fulltext, anchor_citations | Yes |
| 21 | 290 | 2000 | K. Soundararajan | Nonvanishing of Quadratic Dirichlet L-Functions at S = ½ | openalex_fulltext | No |
| 22 | 285 | 2013 | Tomas Antonio Mendes Oliveira e Silva, Siegfried Herzog, Silvio Pardi | Empirical verification of the even Goldbach conjecture and computation of prime gaps  | openalex_fulltext | No |
| 23 | 280 | 2009 | David Jao, Stephen D. Miller, Ramarathnam Venkatesan | Do All Elliptic Curves of the Same Order Have the Same Difficulty of Discrete Log? (E | curated_classics, arxiv_abstract, openalex_fulltext | Yes |
| 24 | 271 | 2002 | Emmanuel Kowalski, Philippe Michel, Jeffrey M. VanderKam | Rankin-Selberg L-functions in the level aspect | openalex_fulltext | No |
| 25 | 261 | 2002 | David Rodney Heath-Brown | The Density of Rational Points on Curves and Surfaces | openalex_fulltext | No |

## Known Harvest Limits

- OpenAlex citation counts run lower in pure mathematics than in computer science and vary across preprint vs. journal editions (merged where titles/DOIs match).
- Only English-language indexed works matching explicit RH/GRH/ERH/Siegel-zero phrases or citing the 9 anchor papers enter the pool.
