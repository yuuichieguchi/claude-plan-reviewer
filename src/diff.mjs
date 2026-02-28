/**
 * Compute a unified-diff-style string with ANSI colors using LCS.
 * @param {string} original
 * @param {string} revised
 * @returns {string} Colored diff, or '' if identical
 */
export function computeDiff(original, revised) {
  if (original === revised) {
    return '';
  }

  const oldLines = original.split('\n');
  const newLines = revised.split('\n');
  const lcs = computeLCS(oldLines, newLines);

  /** @type {string[]} */
  const output = ['--- Original Plan', '+++ Final Plan'];

  let oi = 0; // index into oldLines
  let ni = 0; // index into newLines
  let li = 0; // index into lcs

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length) {
      // Emit removed lines (in old but before next LCS match)
      while (oi < oldLines.length && oldLines[oi] !== lcs[li]) {
        output.push(`\x1b[31m-${oldLines[oi]}\x1b[0m`);
        oi++;
      }
      // Emit added lines (in new but before next LCS match)
      while (ni < newLines.length && newLines[ni] !== lcs[li]) {
        output.push(`\x1b[32m+${newLines[ni]}\x1b[0m`);
        ni++;
      }
      // Emit the common (context) line
      output.push(` ${lcs[li]}`);
      oi++;
      ni++;
      li++;
    } else {
      // No more LCS entries — remaining old lines are removals
      while (oi < oldLines.length) {
        output.push(`\x1b[31m-${oldLines[oi]}\x1b[0m`);
        oi++;
      }
      // Remaining new lines are additions
      while (ni < newLines.length) {
        output.push(`\x1b[32m+${newLines[ni]}\x1b[0m`);
        ni++;
      }
    }
  }

  return output.join('\n');
}

/**
 * Compute the Longest Common Subsequence of two string arrays.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {string[]}
 */
function computeLCS(a, b) {
  const m = a.length;
  const n = b.length;

  // Build DP table
  /** @type {number[][]} */
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the actual LCS
  /** @type {string[]} */
  const result = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.push(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  result.reverse();
  return result;
}
