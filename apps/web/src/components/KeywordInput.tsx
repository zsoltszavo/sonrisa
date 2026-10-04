import { keywordSchema, MAX_KEYWORDS, normaliseText } from '@sonrisa/shared';
import { Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Input } from './ui/input';

const sameKeyword = (a: string, b: string) => normaliseText(a) === normaliseText(b);

/**
 * Keyword chips (D4): type and press Enter or comma to add; Backspace in the empty box removes the
 * last one. Suggestions for the chosen Category add with one click. Duplicates are compared the way
 * matching compares text (case and accents ignored), so "Tokyo" and "tōkyō" count as one.
 */
export function KeywordInput({
  value,
  onChange,
  suggestions,
  error,
  id,
}: {
  value: string[];
  onChange: (keywords: string[]) => void;
  suggestions: readonly string[];
  error?: string;
  id: string;
}) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const hintId = useId();
  const errorId = useId();
  const full = value.length >= MAX_KEYWORDS;

  /**
   * Adds several keywords in one change (a paste of "oil, gas" must keep both). Checks run against
   * the growing list, so duplicates and the limit hold inside one paste too. Returns the parts that
   * were refused, so they stay in the box for the user to fix.
   */
  function addAll(raws: string[]): string[] {
    const next = [...value];
    const refused: string[] = [];
    let firstProblem: string | null = null;
    for (const raw of raws) {
      const parsed = keywordSchema.safeParse(raw);
      let reason: string | null = null;
      if (!parsed.success) reason = parsed.error.issues[0]?.message ?? 'That keyword is not valid.';
      else if (next.some((keyword) => sameKeyword(keyword, parsed.data)))
        reason = `"${parsed.data}" is already on this rule.`;
      else if (next.length >= MAX_KEYWORDS)
        reason = `A rule can have at most ${String(MAX_KEYWORDS)} keywords.`;
      if (reason !== null || !parsed.success) {
        firstProblem ??= reason;
        refused.push(raw.trim());
        continue;
      }
      next.push(parsed.data);
    }
    if (next.length !== value.length) onChange(next);
    setProblem(firstProblem);
    return refused;
  }

  const add = (raw: string) => {
    if (addAll([raw]).length === 0) setDraft('');
  };

  const remaining = suggestions.filter((s) => !value.some((keyword) => sameKeyword(keyword, s)));
  const shownError = problem ?? error;

  return (
    <div className="grid gap-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Keywords on this rule">
          {value.map((keyword) => (
            <li
              key={keyword}
              className="inline-flex items-center gap-1 rounded-full bg-forest py-1 pr-1 pl-3 text-sm text-white"
            >
              {keyword}
              <button
                type="button"
                className="inline-flex size-6 items-center justify-center rounded-full hover:bg-white/20 focus-visible:outline-mint"
                aria-label={`Remove keyword ${keyword}`}
                onClick={() => {
                  onChange(value.filter((k) => k !== keyword));
                }}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        disabled={full}
        placeholder={full ? 'Keyword limit reached' : 'Type a word or phrase, then press Enter'}
        aria-describedby={[hintId, shownError ? errorId : ''].filter(Boolean).join(' ')}
        aria-invalid={shownError ? true : undefined}
        onChange={(event) => {
          const next = event.target.value;
          // A comma finishes a keyword, so pasting "oil, gas" adds both.
          if (next.includes(',')) {
            const parts = next.split(',');
            const last = parts.pop() ?? '';
            const refused = addAll(parts.filter((part) => part.trim() !== ''));
            setDraft([...refused, last.trimStart()].filter(Boolean).join(', '));
          } else {
            setDraft(next);
            if (problem) setProblem(null);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (draft.trim()) add(draft);
          } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
      />
      <p id={hintId} className="text-sm text-muted-foreground">
        An Event matches if any keyword appears as a whole word in its title, summary or place.
        Leave empty to match on Category and Severity alone.
      </p>
      {shownError && (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {shownError}
        </p>
      )}
      {remaining.length > 0 && !full && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Suggestions:</span>
          {remaining.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-mint px-3 py-1 text-sm text-forest hover:bg-mint"
              aria-label={`Add keyword ${suggestion}`}
              onClick={() => {
                add(suggestion);
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
