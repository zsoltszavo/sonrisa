import type { ConfigField, ConfigValues } from '@/lib/schema-config';
import { Input } from './ui/input';
import { Label } from './ui/label';

/** Renders the fields that `configFields()` read from a Channel's JSON Schema (D11). */
export function SchemaForm({
  fields,
  values,
  errors,
  onChange,
  idPrefix,
}: {
  fields: ConfigField[];
  values: ConfigValues;
  errors: Record<string, string>;
  onChange: (values: ConfigValues) => void;
  idPrefix: string;
}) {
  return (
    <>
      {fields.map((field) => {
        const id = `${idPrefix}-${field.name}`;
        const error = errors[field.name];
        const describedBy = [field.description && `${id}-hint`, error && `${id}-error`]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={field.name} className="grid gap-2">
            <Label htmlFor={id}>
              {field.label}
              {!field.required && <span className="text-muted-foreground"> (optional)</span>}
            </Label>
            {field.description && (
              <p id={`${id}-hint`} className="text-sm text-muted-foreground">
                {field.description}
              </p>
            )}
            <Input
              id={id}
              name={field.name}
              type={field.inputType}
              required={field.required}
              autoComplete={field.inputType === 'email' ? 'email' : 'off'}
              spellCheck={false}
              value={values[field.name] ?? ''}
              onChange={(event) => {
                onChange({ ...values, [field.name]: event.target.value });
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
            />
            {error && (
              <p id={`${id}-error`} className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
