import { useRef } from 'react';
import { parsePackageText } from '@/share/share';
import { importPackage } from './SharedView';
import { restoreBackup } from '@/db/backup';
import { Button } from '@/components/ui/Button';
import { toast } from '@/state/toast';
import { navigate } from '@/state/router';
import { FileUp } from 'lucide-react';

/** Importa um projeto exportado (.painel.json) ou um backup completo. */
export function ImportProjectButton({ label = 'Importar projeto' }: { label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const text = await f.text();
      if (text.includes('"painel-financas-backup"')) {
        const r = await restoreBackup(text, 'merge');
        toast(`Backup mesclado: ${Object.values(r.counts).reduce((a, b) => a + b, 0)} registro(s).`);
        return;
      }
      const id = await importPackage(parsePackageText(text), 'file');
      toast('Projeto importado como cópia.');
      navigate(`/dashboards/${id}`);
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { if (ref.current) ref.current.value = ''; }
  };
  return (
    <>
      <input ref={ref} type="file" accept=".json,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-hidden tabIndex={-1} />
      <Button icon={<FileUp className="h-4 w-4" />} onClick={() => ref.current?.click()}>{label}</Button>
    </>
  );
}
