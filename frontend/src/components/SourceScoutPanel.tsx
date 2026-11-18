import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Search, AlertCircle, ArrowDownToLine } from 'lucide-react';
import {
  MAX_LINE_WINDOW,
  MAX_SNIPPET_CHARS,
  PRIMARY_TEXT_CATALOG,
  searchPrimaryTextLines,
  sliceAndHashPrimaryText,
  type SlicedSnippetResult,
} from '../lib/sourceScout';
import { truncateMiddle, validateImmutableEvidenceUrl } from '../lib/validation';

interface SourceScoutPanelProps {
  initialUrl?: string;
  onApplyRange: (params: {
    evidenceUrl: string;
    startLine: number;
    endLine: number;
  }) => void;
}

export function SourceScoutPanel({
  initialUrl,
  onApplyRange,
}: SourceScoutPanelProps) {
  const [urlInput, setUrlInput] = useState(
    initialUrl || PRIMARY_TEXT_CATALOG[0].url
  );
  const [rawText, setRawText] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [query, setQuery] = useState(PRIMARY_TEXT_CATALOG[0].suggestedQuery);
  const [startLine, setStartLine] = useState<number>(499);
  const [endLine, setEndLine] = useState<number>(522);
  const [sliceResult, setSliceResult] = useState<SlicedSnippetResult | null>(null);
  const [appliedNotice, setAppliedNotice] = useState(false);

  const urlCheck = useMemo(() => validateImmutableEvidenceUrl(urlInput), [urlInput]);

  const handleLoadUrl = async (targetUrl: string, suggestedQuery?: string) => {
    const check = validateImmutableEvidenceUrl(targetUrl);
    if (!check.valid) {
      setFetchError(check.reason || 'URL fails immutable source allowlist.');
      return;
    }
    setIsFetching(true);
    setFetchError(null);
    try {
      const resp = await fetch(targetUrl.trim());
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} while fetching primary text.`);
      }
      const text = await resp.text();
      setRawText(text);
      setLoadedUrl(targetUrl.trim());
      if (suggestedQuery) {
        setQuery(suggestedQuery);
        const hits = searchPrimaryTextLines(text, suggestedQuery, 1);
        if (hits.length > 0) {
          const s = Math.max(1, hits[0].lineNumber - 2);
          const e = s + 22;
          setStartLine(s);
          setEndLine(e);
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFetching(false);
    }
  };

  const searchHits = useMemo(() => {
    if (!rawText || !query.trim()) return [];
    return searchPrimaryTextLines(rawText, query, 30);
  }, [rawText, query]);

  useEffect(() => {
    if (!rawText) {
      setSliceResult(null);
      return;
    }
    let cancelled = false;
    void sliceAndHashPrimaryText(rawText, startLine, endLine).then((res) => {
      if (!cancelled) setSliceResult(res);
    });
    return () => {
      cancelled = true;
    };
  }, [rawText, startLine, endLine]);

  const handleSetStart = (lineNum: number) => {
    setStartLine(lineNum);
    if (endLine < lineNum || endLine - lineNum + 1 > MAX_LINE_WINDOW) {
      setEndLine(lineNum + 20);
    }
  };

  const handleApply = () => {
    if (!loadedUrl || !sliceResult?.valid) return;
    onApplyRange({
      evidenceUrl: loadedUrl,
      startLine: sliceResult.startLine,
      endLine: sliceResult.endLine,
    });
    setAppliedNotice(true);
    setTimeout(() => setAppliedNotice(false), 2000);
  };

  return (
    <div className="rounded-[2px] border border-[#141518] bg-[#FDFBF7] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DED7C8] pb-2.5">
        <div>
          <div className="inline-flex items-center gap-1.5 font-ledger-mono text-[10px] font-semibold uppercase tracking-widest text-[#8C6D2E]">
            <BookOpen className="h-3.5 w-3.5" />
            Source Scout · Pre-Flight Primary Text Slicer
          </div>
          <p className="mt-0.5 text-xs text-[#57544D]">
            Inspect commit-pinned literary texts, search passages, and compute the exact contract SHA-256 before staking GEN.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRIMARY_TEXT_CATALOG.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setUrlInput(entry.url);
                void handleLoadUrl(entry.url, entry.suggestedQuery);
              }}
              className="rounded-[2px] border border-[#CFC7B5] bg-[#FAF7F0] px-2.5 py-1 font-ledger-mono text-[10px] font-semibold text-[#141518] hover:border-[#141518] cursor-pointer"
            >
              Load {entry.id === 'wizard-of-oz-1900' ? 'Wizard of Oz (1900)' : 'Dracula (1897)'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://raw.githubusercontent.com/<owner>/<repo>/<40-hex-sha>/<path>"
          className="flex-1 rounded-[2px] border border-[#CFC7B5] bg-white px-2.5 py-1.5 font-ledger-mono text-[11px] text-[#141518] focus:border-[#141518] focus:outline-none"
        />
        <button
          type="button"
          disabled={isFetching || !urlCheck.valid}
          onClick={() => void handleLoadUrl(urlInput)}
          className="inline-flex items-center justify-center gap-1.5 rounded-[2px] border border-[#141518] bg-[#141518] px-3 py-1.5 font-ledger-mono text-[11px] font-semibold text-[#FAF7F0] hover:bg-[#2A2C32] disabled:opacity-45 cursor-pointer"
        >
          <Search className="h-3.5 w-3.5" />
          {isFetching ? 'Fetching...' : 'Fetch Source'}
        </button>
      </div>

      {!urlCheck.valid && (
        <div className="flex items-center gap-1.5 text-[11px] font-ledger-mono text-[#9B2226]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{urlCheck.reason}</span>
        </div>
      )}

      {fetchError && (
        <div className="flex items-center gap-1.5 rounded-[2px] border border-[#9B2226] bg-[#FCEBEC] px-3 py-2 text-xs text-[#7D1A1E]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {rawText && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
          {/* Left: Keyword Search Hits */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search passage (e.g. silver shoes, knives)..."
                className="flex-1 rounded-[2px] border border-[#CFC7B5] bg-white px-2.5 py-1 text-xs text-[#141518] focus:border-[#141518] focus:outline-none"
              />
              <span className="font-ledger-mono text-[10px] text-[#57544D]">
                {searchHits.length} hits
              </span>
            </div>

            <div className="max-h-52 overflow-y-auto rounded-[2px] border border-[#DED7C8] bg-[#FAF7F0] divide-y divide-[#EAE4D7]">
              {searchHits.length === 0 ? (
                <div className="p-3 text-xs text-[#57544D]">
                  No lines matched "{query}". Try another keyword.
                </div>
              ) : (
                searchHits.map((hit) => (
                  <div
                    key={hit.lineNumber}
                    className="flex items-start justify-between gap-2 px-2.5 py-1.5 text-[11px] hover:bg-[#F3EEE2]"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-ledger-mono font-semibold text-[#8C6D2E] mr-2">
                        L{hit.lineNumber}
                      </span>
                      <span className="text-[#141518] break-words">
                        {hit.text || <em className="text-[#8E897F]">(blank line)</em>}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSetStart(hit.lineNumber)}
                        className="rounded-[2px] border border-[#CFC7B5] bg-white px-1.5 py-0.5 font-ledger-mono text-[9px] font-semibold text-[#141518] hover:border-[#141518] cursor-pointer"
                      >
                        Start
                      </button>
                      <button
                        type="button"
                        onClick={() => setEndLine(hit.lineNumber)}
                        className="rounded-[2px] border border-[#CFC7B5] bg-white px-1.5 py-0.5 font-ledger-mono text-[9px] font-semibold text-[#141518] hover:border-[#141518] cursor-pointer"
                      >
                        End
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Live Contract-Parity Slice & Digest Preview */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D]">
                  Start Line
                </span>
                <input
                  type="number"
                  min={1}
                  value={startLine}
                  onChange={(e) => setStartLine(Number(e.target.value))}
                  className="mt-0.5 w-full rounded-[2px] border border-[#CFC7B5] bg-white px-2 py-1 font-ledger-mono text-xs text-[#141518]"
                />
              </label>
              <label className="block">
                <span className="font-ledger-mono text-[10px] uppercase tracking-wider text-[#57544D]">
                  End Line
                </span>
                <input
                  type="number"
                  min={1}
                  value={endLine}
                  onChange={(e) => setEndLine(Number(e.target.value))}
                  className="mt-0.5 w-full rounded-[2px] border border-[#CFC7B5] bg-white px-2 py-1 font-ledger-mono text-xs text-[#141518]"
                />
              </label>
            </div>

            {sliceResult && (
              <div className="rounded-[2px] border border-[#DED7C8] bg-[#FAF7F0] p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 font-ledger-mono text-[10px]">
                  <span className="text-[#57544D]">
                    Window:{' '}
                    <strong className={sliceResult.valid ? 'text-[#1B5E3F]' : 'text-[#9B2226]'}>
                      {sliceResult.windowLines}/{MAX_LINE_WINDOW} lines
                    </strong>
                  </span>
                  <span className="text-[#57544D]">
                    Normalized:{' '}
                    <strong className="text-[#141518]">
                      {sliceResult.snippetLength}/{MAX_SNIPPET_CHARS} chars
                    </strong>
                  </span>
                </div>

                {sliceResult.valid ? (
                  <>
                    <div className="max-h-24 overflow-y-auto rounded-[2px] border border-[#E5DFD2] bg-white p-2 font-ledger-mono text-[10px] leading-relaxed text-[#141518]">
                      {sliceResult.snippet}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className="font-ledger-mono text-[10px] text-[#57544D]"
                        title={sliceResult.snippetSha256}
                      >
                        SHA-256: <strong className="text-[#141518]">{truncateMiddle(sliceResult.snippetSha256, 10, 8)}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={handleApply}
                        className="inline-flex items-center gap-1 rounded-[2px] border border-[#1B5E3F] bg-[#1B5E3F] px-2.5 py-1 font-ledger-mono text-[10px] font-semibold text-white hover:bg-[#14472F] cursor-pointer"
                      >
                        {appliedNotice ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            Applied to Claim Form
                          </>
                        ) : (
                          <>
                            <ArrowDownToLine className="h-3 w-3" />
                            Apply Range to Claim Form
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-[#9B2226] font-ledger-mono">
                    {sliceResult.reason}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
