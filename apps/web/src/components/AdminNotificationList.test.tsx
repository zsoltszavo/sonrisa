import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderAt } from '@/test/render';
import { AdminNotificationList } from './AdminNotificationList';

const base = {
  id: 'n1',
  kind: 'match' as const,
  severity: 3 as const,
  createdAt: new Date('2026-10-04T10:00:00Z'),
  sentAt: null,
  user: { id: 'u1', email: 'alice@demo.test' },
  event: { id: 'e1', title: 'Storm', source: 'simulated' as const, category: 'disaster' as const },
  destination: { id: 'd1', label: 'Team', channel: 'slack' },
};

describe('AdminNotificationList', () => {
  it('marks the error of a retried Notification as the previous one, with no attempt yet', async () => {
    renderAt(
      <AdminNotificationList
        label="Notifications"
        notifications={[
          { ...base, status: 'pending', attempts: 0, lastError: 'Slack answered 404' },
        ]}
      />,
    );
    expect(await screen.findByText('Not attempted yet')).toBeInTheDocument();
    expect(screen.getByText('Previous error:')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
  });
});
