import { createBrowserRouter, Navigate } from 'react-router';
import { AdminLayout } from './components/AdminLayout';
import { AppShell } from './components/AppShell';
import { RedirectIfSignedIn, RequireAdmin, RequireAuth } from './components/RouteGuards';
import { EventDetailPage } from './routes/admin/EventDetailPage';
import { EventSourcesPage } from './routes/admin/EventSourcesPage';
import { EventsPage } from './routes/admin/EventsPage';
import { NotificationLogPage } from './routes/admin/NotificationLogPage';
import { SimulatorPage } from './routes/admin/SimulatorPage';
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
          {
            // UX only: the server answers 403 to every /api/admin call from a non-admin.
            element: <RequireAdmin />,
            children: [
              {
                element: <AdminLayout />,
                children: [
                  { path: '/admin', element: <Navigate to="/admin/sources" replace /> },
                  { path: '/admin/sources', element: <EventSourcesPage /> },
                  { path: '/admin/simulator', element: <SimulatorPage /> },
                  { path: '/admin/events', element: <EventsPage /> },
                  { path: '/admin/events/:eventId', element: <EventDetailPage /> },
                  { path: '/admin/notifications', element: <NotificationLogPage /> },
                ],
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
