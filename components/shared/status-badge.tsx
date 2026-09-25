import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  // neutral / in-progress
  draft: 'bg-muted text-muted-foreground',
  pending: 'bg-muted text-muted-foreground',
  submitted: 'bg-secondary text-secondary-foreground',
  under_verification: 'bg-secondary text-secondary-foreground',
  under_review: 'bg-secondary text-secondary-foreground',
  booked: 'bg-secondary text-secondary-foreground',
  waiting: 'bg-secondary text-secondary-foreground',
  uploaded: 'bg-secondary text-secondary-foreground',
  // positive
  approved: 'bg-primary/10 text-primary',
  confirmed: 'bg-primary/10 text-primary',
  completed: 'bg-primary/10 text-primary',
  checked_in: 'bg-primary/10 text-primary',
  payment_completed: 'bg-primary/10 text-primary',
  active: 'bg-primary/10 text-primary',
  verified: 'bg-primary/10 text-primary',
  resolved: 'bg-primary/10 text-primary',
  closed: 'bg-primary/10 text-primary',
  // attention
  correction_required: 'bg-accent/15 text-accent',
  in_progress: 'bg-accent/15 text-accent',
  called: 'bg-accent/15 text-accent',
  // negative
  rejected: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-destructive/10 text-destructive',
  no_show: 'bg-destructive/10 text-destructive',
  expired: 'bg-destructive/10 text-destructive',
  payment_failed: 'bg-destructive/10 text-destructive',
  suspended: 'bg-destructive/10 text-destructive',
  disabled: 'bg-destructive/10 text-destructive',
  deactivated: 'bg-destructive/10 text-destructive',
};

const STATUS_LABELS: Record<string, string> = {
  under_verification: 'Under verification',
  correction_required: 'Correction required',
  checked_in: 'Checked in',
  in_progress: 'In progress',
  no_show: 'No show',
  payment_completed: 'Payment completed',
  payment_failed: 'Payment failed',
  under_review: 'Under review',
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground';
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', style)}>
      {label}
    </span>
  );
}
