import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAt } from '@/test/render';
import { RulesPage } from './RulesPage';

const rule = (id: string, category: string, minSeverity: number, keywords: string[] = []) => ({
  id,
  userId: 'u1',
  category,
  minSeverity,
  keywords,
  destinationIds: ['d1'],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RulesPage', () => {
  it('describes each rule in plain words and refreshes the list after a delete', async () => {
    const user = userEvent.setup();
    let rules = [rule('r1', 'earthquake', 4), rule('r2', 'news', 3, ['oil', 'OPEC'])];
    const requests = mockApi({
      'GET /api/rules': () => ({ body: rules }),
      'GET /api/destinations': () => ({
        body: [
          {
            id: 'd1',
            userId: 'u1',
            channel: 'email',
            label: 'My email',
            config: { to: 'a@b.test' },
          },
        ],
      }),
      'DELETE /api/rules/r1': () => {
        rules = rules.filter((r) => r.id !== 'r1');
        return { status: 204 };
      },
    });
    renderAt(<RulesPage />);

    const list = await screen.findByRole('list', { name: 'Alert rules' });
    expect(within(list).getByText('Severity 4 or higher (M6 and above)')).toBeInTheDocument();
    expect(within(list).getAllByText('Sends to My email')).toHaveLength(2);

    await user.click(
      screen.getByRole('button', { name: 'Delete rule: Earthquakes, severe or worse' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Delete rule' }));

    // The cached list must be invalidated, not left showing the deleted rule.
    await waitFor(() => {
      expect(screen.queryByText('Earthquakes, severe or worse')).not.toBeInTheDocument();
    });
    expect(requests.filter((r) => r.method === 'GET' && r.path === '/api/rules')).toHaveLength(2);
  });

  it('invites the user to create a first rule', async () => {
    mockApi({
      'GET /api/rules': () => ({ body: [] }),
      'GET /api/destinations': () => ({ body: [] }),
    });
    renderAt(<RulesPage />);
    expect(await screen.findByRole('heading', { name: 'No alert rules yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New alert rule' })).toHaveAttribute(
      'href',
      '/rules/new',
    );
  });

  it('shows an error with a retry when the rules fail to load', async () => {
    mockApi({
      'GET /api/rules': () => ({ status: 500, body: { message: 'Internal server error' } }),
      'GET /api/destinations': () => ({ body: [] }),
    });
    renderAt(<RulesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
