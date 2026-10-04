import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from './components/AppShell';
import { RedirectIfSignedIn, RequireAuth } from './components/RouteGuards';
import { DestinationsPage } from './routes/DestinationsPage';
import { LoginPage } from './routes/LoginPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { NotificationsPage } from './routes/NotificationsPage';
import { RuleEditorPage } from './routes/RuleEditorPage';
import { RulesPage } from './routes/RulesPage';

export const router = createBrowserRouter([
  {
    element: <RedirectIfSignedIn />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Navigate to="/notifications" replace /> },
          { path: '/notifications', element: <NotificationsPage /> },
          { path: '/rules', element: <RulesPage /> },
          { path: '/rules/new', element: <RuleEditorPage /> },
          { path: '/rules/:ruleId', element: <RuleEditorPage /> },
          { path: '/destinations', element: <DestinationsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
