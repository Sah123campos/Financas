import { lazy, Suspense } from 'react';
import { match, useRoute } from '@/state/router';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/Toaster';
import { ConfirmHost } from '@/components/ui/confirm';
import { Spinner, EmptyState } from '@/components/ui/misc';
import { TransactionFormHost } from '@/features/finance/TransactionForm';
import { HomePage } from '@/pages/HomePage';
import { Button } from '@/components/ui/Button';
import { navigate } from '@/state/router';

const FinancePage = lazy(() => import('@/pages/FinancePage').then((m) => ({ default: m.FinancePage })));
const DatasetsPage = lazy(() => import('@/pages/DatasetsPage').then((m) => ({ default: m.DatasetsPage })));
const DatasetEditorPage = lazy(() => import('@/features/datasets/DatasetEditor').then((m) => ({ default: m.DatasetEditorPage })));
const NewDatasetPage = lazy(() => import('@/features/datasets/DatasetEditor').then((m) => ({ default: m.NewDatasetPage })));
const DashboardsPage = lazy(() => import('@/pages/DashboardsPage').then((m) => ({ default: m.DashboardsPage })));
const DashboardPage = lazy(() => import('@/features/dashboards/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));
const SharedPage = lazy(() => import('@/pages/SharedPage').then((m) => ({ default: m.SharedPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SharedView = lazy(() => import('@/features/share/SharedView').then((m) => ({ default: m.SharedView })));

function Routes() {
  const route = useRoute();
  const path = route.split('?')[0];
  let p: Record<string, string> | null;
  if (path === '/' || path === '') return <HomePage />;
  if ((p = match('/s/:payload', path))) return <SharedView payload={route.slice(3)} />;
  if (path === '/financas') return <FinancePage />;
  if ((p = match('/financas/:tab', path))) return <FinancePage tab={p.tab} />;
  if (path === '/planilhas') return <DatasetsPage />;
  if (path === '/planilhas/nova') return <NewDatasetPage />;
  if ((p = match('/planilhas/:id', path))) return <DatasetEditorPage id={p.id} />;
  if (path === '/dashboards') return <DashboardsPage />;
  if ((p = match('/dashboards/:id', path))) return <DashboardPage id={p.id} />;
  if (path === '/modelos') return <TemplatesPage />;
  if (path === '/compartilhados') return <SharedPage />;
  if (path === '/config') return <SettingsPage />;
  return <EmptyState title="Página não encontrada" action={<Button onClick={() => navigate('/')}>Ir para o início</Button>} />;
}

export function App() {
  return (
    <AppShell>
      <Suspense fallback={<Spinner />}><Routes /></Suspense>
      <TransactionFormHost />
      <ConfirmHost />
      <Toaster />
    </AppShell>
  );
}
