'use client';

import { useEffect, useRef, useState } from 'react';
import { createBooking } from '@/services/booking/booking-service';
import {
  getSlotPreview, findAlternatives,
  type EligibleCentre, type SlotPreview, type AlternativeOptions,
} from '@/services/booking/booking-preview-service';
import { bookingSchema } from '@/lib/validation/booking';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate, formatDuration, formatQuantity } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface BookableCrop {
  id: string;
  name: string;
  approvedQuantity: number;
  remainingQuantity: number;
}

interface BookedResult {
  appointmentId: string;
}

export function BookingForm({
  crops,
  centres,
  today,
  maxDate,
}: {
  crops: BookableCrop[];
  centres: EligibleCentre[];
  today: string;
  maxDate: string;
}) {
  const [cropId, setCropId] = useState(crops.find((c) => c.remainingQuantity > 0)?.id ?? crops[0]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [centreId, setCentreId] = useState(centres[0]?.centreId ?? '');
  const [procurementDate, setProcurementDate] = useState('');
  const [harvestDate, setHarvestDate] = useState(today);
  const [time, setTime] = useState('');

  const [preview, setPreview] = useState<SlotPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [alternatives, setAlternatives] = useState<AlternativeOptions | null>(null);
  const [alternativesLoading, setAlternativesLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState<BookedResult | null>(null);

  const requestId = useRef(0);
  const crop = crops.find((c) => c.id === cropId);
  const centre = centres.find((c) => c.centreId === centreId);
  const qtyNumber = Number(quantity);

  // Live capacity / queue / slot preview whenever centre or date changes.
  useEffect(() => {
    setTime('');
    setAlternatives(null);
    if (!centreId || !procurementDate) {
      setPreview(null);
      return;
    }
    const id = (requestId.current += 1);
    setPreviewLoading(true);
    getSlotPreview(centreId, procurementDate).then((result) => {
      if (id !== requestId.current) return; // a newer request superseded this one
      setPreview(result);
      setPreviewLoading(false);
    });
  }, [centreId, procurementDate]);

  const notEnoughCapacity = !!preview && qtyNumber > 0 && preview.remainingCapacity < qtyNumber;
  const noSlots = !!preview && (!preview.isOpenDay || preview.slots.every((s) => s.past || s.used >= s.capacity));

  async function loadAlternatives() {
    if (!centreId || !procurementDate) return;
    setAlternativesLoading(true);
    setAlternatives(await findAlternatives(centreId, procurementDate, qtyNumber > 0 ? qtyNumber : 0.01));
    setAlternativesLoading(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const input = {
      procurementCropId: cropId,
      centreId,
      quantityQuintal: qtyNumber,
      harvestDate,
      procurementDate,
      procurementTime: time,
    };
    const parsed = bookingSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the booking details');
      return;
    }
    if (crop && qtyNumber > crop.remainingQuantity) {
      setError(`Only ${formatQuantity(crop.remainingQuantity)} of ${crop.name} remains bookable.`);
      return;
    }

    setSubmitting(true);
    const result = await createBooking(parsed.data);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      // The slot may have just filled — refresh what the farmer sees.
      if (centreId && procurementDate) setPreview(await getSlotPreview(centreId, procurementDate));
      return;
    }
    setBooked({ appointmentId: result.appointmentId });
  }

  if (booked) {
    return (
      <Card className="mt-6 border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-6">
          <h2 className="font-heading text-xl font-semibold">Booking confirmed</h2>
          <p className="text-sm text-muted-foreground">
            Your token and QR code are ready. Show the QR code at the centre on {formatDate(procurementDate)}.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild><a href="/farmer/queue">View my token</a></Button>
            <Button asChild variant="outline"><a href="/farmer/bookings">All bookings</a></Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="crop">Crop</Label>
          <Select id="crop" value={cropId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCropId(e.target.value)}>
            {crops.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          {crop && (
            <p className="text-xs text-muted-foreground">
              Approved {formatQuantity(crop.approvedQuantity)} · {formatQuantity(crop.remainingQuantity)} still bookable
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quantity">Quantity (quintal)</Label>
          <Input
            id="quantity"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            max={crop?.remainingQuantity}
            value={quantity}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuantity(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="centre">Procurement centre</Label>
          <Select id="centre" value={centreId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCentreId(e.target.value)}>
            {centres.map((c) => (
              <option key={c.centreId} value={c.centreId}>{c.name} ({c.code})</option>
            ))}
          </Select>
          {centre && (
            <p className="text-xs text-muted-foreground">
              Open {centre.opensAt}–{centre.closesAt} · {centre.counters} counter{centre.counters === 1 ? '' : 's'}
              {centre.address ? ` · ${centre.address}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="harvestDate">Harvest date</Label>
          <Input
            id="harvestDate"
            type="date"
            max={today}
            value={harvestDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHarvestDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="procurementDate">Procurement date</Label>
          <Input
            id="procurementDate"
            type="date"
            min={today}
            max={maxDate}
            value={procurementDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProcurementDate(e.target.value)}
          />
        </div>
      </div>

      {procurementDate && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            {previewLoading || !preview ? (
              <p className="text-sm text-muted-foreground">{previewLoading ? 'Checking availability…' : 'Availability is unavailable right now.'}</p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Capacity left</dt>
                    <dd className="font-medium">{formatQuantity(preview.remainingCapacity)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">In queue</dt>
                    <dd className="font-medium">{preview.queueLength}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Avg. handling</dt>
                    <dd className="font-medium">{formatDuration(preview.avgProcessingSeconds)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Est. wait</dt>
                    <dd className="font-medium">{formatDuration(preview.estimatedWaitSeconds)}</dd>
                  </div>
                </dl>

                {!preview.isOpenDay ? (
                  <p className="text-sm text-destructive">This centre is closed on the selected day.</p>
                ) : (
                  <div>
                    <p className="text-sm font-medium">Choose a time slot</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {preview.slots.map((s) => {
                        const full = s.used >= s.capacity;
                        const disabled = s.past || full;
                        return (
                          <button
                            key={s.start}
                            type="button"
                            disabled={disabled}
                            onClick={() => setTime(s.start)}
                            className={cn(
                              'rounded-md border px-2 py-2 text-sm transition-colors',
                              time === s.start ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary',
                              disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                            )}
                          >
                            <span className="block font-medium">{s.start}</span>
                            <span className="block text-[11px] opacity-80">{full ? 'Full' : `${s.capacity - s.used} left`}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(notEnoughCapacity || noSlots) && (
                  <div className="rounded-md border border-accent/30 bg-accent/5 p-3 text-sm">
                    <p>
                      {notEnoughCapacity
                        ? 'This centre does not have enough capacity left on that date for your quantity.'
                        : 'No free slots on that date.'}
                    </p>
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={loadAlternatives} disabled={alternativesLoading}>
                      {alternativesLoading ? 'Looking…' : 'Find other dates or centres'}
                    </Button>
                  </div>
                )}

                {alternatives && (
                  <div className="text-sm">
                    {alternatives.dates.length === 0 && alternatives.centres.length === 0 && (
                      <p className="text-muted-foreground">No alternatives with enough room were found in the booking window.</p>
                    )}
                    {alternatives.dates.length > 0 && (
                      <div>
                        <p className="font-medium">Other dates at this centre</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {alternatives.dates.map((d) => (
                            <button
                              key={d.date}
                              type="button"
                              className="rounded-full border border-border px-3 py-1 hover:bg-secondary"
                              onClick={() => setProcurementDate(d.date)}
                            >
                              {formatDate(d.date)} · {formatQuantity(d.remainingCapacity)} left
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {alternatives.centres.length > 0 && (
                      <div className="mt-3">
                        <p className="font-medium">Other centres on this date</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {alternatives.centres.map((c) => (
                            <button
                              key={c.centreId}
                              type="button"
                              className="rounded-full border border-border px-3 py-1 hover:bg-secondary"
                              onClick={() => setCentreId(c.centreId)}
                            >
                              {c.name} · {formatQuantity(c.remainingCapacity)} left
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={submitting || !time}>
        {submitting ? 'Booking…' : 'Confirm booking'}
      </Button>
    </form>
  );
}
