import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router/dom';
import { session } from './lib/session';
import { router } from './router';

// Module-level singletons: React Router v8 warns against keeping a data router in React state.
const queryClient = new QueryClient();
// Signing in or out in another tab switches the user here too: drop everything cached for the old one.
session.onExternalChange(() => {
  queryClient.clear();
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
