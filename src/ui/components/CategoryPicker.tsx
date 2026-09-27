import { renameCategory, setCategoryColor } from '../../lib/api';
import type { CategoryScope } from '../../lib/types';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';
import { TagPicker } from './TagPicker';

/** Velg en tidligere brukt kategori, eller opprett en ny. Nye kategorier lagres av databasen når oppgaven/posten lagres. */
export function CategoryPicker({
  scope,
  value,
  onChange,
  variant = 'field',
  label,
  suggestions = [],
}: {
  scope: CategoryScope;
  value: string;
  onChange: (name: string) => void;
  variant?: 'field' | 'cell';
  label: string;
  suggestions?: string[];
}) {
  const { categories, colorOf, project, reload } = useProject();
  const toast = useToast();
  const options = categories.filter((c) => c.scope === scope).map((c) => ({ name: c.name, color: c.color }));

  return (
    <TagPicker
      options={options}
      value={value ? [value] : []}
      onChange={(v) => onChange(v[0] ?? '')}
      variant={variant}
      label={label}
      suggestions={suggestions}
      colorOf={(n) => colorOf(scope, n)}
      renameHint={`Endrer navnet på alle ${scope === 'task' ? 'oppgaver' : 'poster'} med denne kategorien.`}
      onRename={async (oldName, next) => {
        try {
          await renameCategory(project.id, scope, oldName, next);
          await reload();
          if (value === oldName) onChange(next);
          toast.ok(`Kategorien heter nå «${next}».`);
        } catch (err) {
          toast.error(err);
        }
      }}
      onRecolor={async (name, color) => {
        try {
          await setCategoryColor(project.id, scope, name, color);
          await reload();
        } catch (err) {
          toast.error(err);
        }
      }}
    />
  );
}
