'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { resolverFor } from '@/lib/forms';
import {
  step1Schema, step2Schema, step3Schema, step4Schema,
  STEP2_FIELDS_BY_CATEGORY,
  type FarmerCategoryValue,
  type Step1Input, type Step2Input, type Step3Input, type Step4Input,
} from '@/lib/validation/registration';
import { submitRegistration } from '@/services/farmer/registration-service';
import { LocationPicker, syncLocationToForm, type LocationValue } from './location-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FormErrorSummary } from '@/components/shared/form-error-summary';
import { todayInAppTimezone } from '@/lib/constants';

const STEP_LABELS = ['Personal details', 'Identity & land', 'Procurement crops', 'Review & submit'];

const CATEGORY_LABELS: Record<FarmerCategoryValue, string> = {
  owner_cultivator: 'Owner cultivator',
  tenant_farmer: 'Tenant farmer',
  sharecropper: 'Sharecropper',
  joint_co_owner: 'Joint / co-owner',
  other_eligible_cultivator: 'Other eligible cultivator',
};

export interface RegistrationInitial {
  step1?: Partial<Step1Input>;
  step2?: Partial<Step2Input>;
  crops?: { cropId: string; expectedQuantity: number }[];
  /** Reviewer's note when the application was sent back for correction. */
  reviewNote?: string | null;
}

function Field({
  id, label, error, hint, children,
}: {
  id?: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function RegistrationWizard({
  crops,
  initial,
}: {
  crops: { id: string; name: string; unit: string }[];
  initial: RegistrationInitial;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [step1Data, setStep1Data] = useState<Step1Input | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Input | null>(null);
  const [step3Data, setStep3Data] = useState<Step3Input | null>(null);

  const [location, setLocation] = useState<LocationValue>({
    stateId: initial.step1?.stateId ?? '',
    districtId: initial.step1?.districtId ?? '',
    subDistrictId: initial.step1?.subDistrictId ?? '',
    villageOrTownId: initial.step1?.villageOrTownId ?? '',
    villageOrTownKind: initial.step1?.villageOrTownKind ?? '',
  });

  // One form per step; the parent holds the values so Back never loses data.
  const step1Form = useForm<Step1Input>({
    resolver: resolverFor<Step1Input>(step1Schema),
    defaultValues: {
      ...initial.step1,
      stateId: location.stateId,
      districtId: location.districtId,
      subDistrictId: location.subDistrictId,
      villageOrTownId: location.villageOrTownId,
      villageOrTownKind: location.villageOrTownKind || undefined,
    },
  });
  const step2Form = useForm<Step2Input>({
    resolver: resolverFor<Step2Input>(step2Schema),
    defaultValues: {
      farmerIdIfAvailable: initial.step2?.farmerIdIfAvailable ?? '',
      landOwner: initial.step2?.landOwner,
      landRecord: { areaUnit: 'acre', ...initial.step2?.landRecord },
      cultivation: { cultivatedAreaUnit: 'acre', ...initial.step2?.cultivation },
    },
  });
  const step3Form = useForm<Step3Input>({
    resolver: resolverFor<Step3Input>(step3Schema),
    defaultValues: {
      procurementCrops:
        initial.crops && initial.crops.length > 0
          ? initial.crops
          : [{ cropId: '', expectedQuantity: undefined as unknown as number }],
    },
  });
  const step4Form = useForm<Step4Input>({ resolver: resolverFor<Step4Input>(step4Schema) });
  const cropFields = useFieldArray({ control: step3Form.control, name: 'procurementCrops' });

  const category = step1Data?.farmerCategory;
  const step2Config = category ? STEP2_FIELDS_BY_CATEGORY[category] : undefined;

  const e1 = step1Form.formState.errors;
  const e2 = step2Form.formState.errors;
  const e3 = step3Form.formState.errors;
  const e4 = step4Form.formState.errors;

  function onLocationChange(next: LocationValue) {
    setLocation(next);
    // The picker's state is not part of react-hook-form's values — mirror it in,
    // otherwise the required location fields can never validate.
    syncLocationToForm(
      (n, v, o) => step1Form.setValue(n as never, v as never, o),
      next,
      step1Form.formState.isSubmitted,
    );
  }

  function onStep1Submit(values: Step1Input) {
    setStep1Data(values);
    setServerError(null);
    setStep(1);
  }

  function onStep2Submit(values: Step2Input) {
    if (step2Config?.ownerRequired && !values.landOwner?.ownerName?.trim()) {
      step2Form.setError('landOwner.ownerName' as never, {
        message: 'Land owner / co-owner name is required for your category',
      });
      return;
    }
    setStep2Data(values);
    setServerError(null);
    setStep(2);
  }

  function onStep3Submit(values: Step3Input) {
    setStep3Data(values);
    setServerError(null);
    setStep(3);
  }

  async function onFinalSubmit(values: Step4Input) {
    if (!step1Data || !step2Data || !step3Data) return;
    setServerError(null);
    setSubmitting(true);
    const result = await submitRegistration({ step1: step1Data, step2: step2Data, step3: step3Data, step4: values });
    setSubmitting(false);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    router.push('/farmer/verification-status');
    router.refresh();
  }

  const selectedCrops = (step3Data?.procurementCrops ?? []).map((c) => ({
    name: crops.find((x) => x.id === c.cropId)?.name ?? 'Crop',
    quantity: c.expectedQuantity,
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Farmer registration</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Nothing is saved until you submit on the last step, so you can go back and change anything.
      </p>

      {initial.reviewNote && (
        <div className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-4 text-sm">
          <p className="font-medium">The reviewer asked for a correction</p>
          <p className="mt-1 text-muted-foreground">{initial.reviewNote}</p>
        </div>
      )}

      <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEP_LABELS.map((label, i) => (
          <li
            key={label}
            className={`rounded-md border px-3 py-2 text-xs ${
              i === step
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : i < step
                  ? 'border-primary/30 text-primary'
                  : 'border-border text-muted-foreground'
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {/* ---------------- STEP 1 ---------------- */}
      {step === 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Personal & farmer details</CardTitle>
            <CardDescription>Enter details exactly as they appear on your land and identity records.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={step1Form.handleSubmit(onStep1Submit)} className="flex flex-col gap-4" noValidate>
              <Field id="farmerCategory" label="Farmer category" error={e1.farmerCategory?.message}>
                <Select id="farmerCategory" {...step1Form.register('farmerCategory')}>
                  <option value="">Select category</option>
                  {(Object.keys(CATEGORY_LABELS) as FarmerCategoryValue[]).map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field id="firstName" label="First name" error={e1.firstName?.message}>
                  <Input id="firstName" {...step1Form.register('firstName')} />
                </Field>
                <Field id="middleName" label="Middle name (optional)">
                  <Input id="middleName" {...step1Form.register('middleName')} />
                </Field>
                <Field id="lastName" label="Last name" error={e1.lastName?.message}>
                  <Input id="lastName" {...step1Form.register('lastName')} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field id="fatherName" label="Father's name (optional)">
                  <Input id="fatherName" {...step1Form.register('fatherName')} />
                </Field>
                <Field id="motherName" label="Mother's name (optional)">
                  <Input id="motherName" {...step1Form.register('motherName')} />
                </Field>
                <Field id="spouseName" label="Spouse's name (optional)">
                  <Input id="spouseName" {...step1Form.register('spouseName')} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field id="dateOfBirth" label="Date of birth" error={e1.dateOfBirth?.message}>
                  <Input id="dateOfBirth" type="date" max={todayInAppTimezone()} {...step1Form.register('dateOfBirth')} />
                </Field>
                <Field id="gender" label="Gender" error={e1.gender?.message}>
                  <Select id="gender" {...step1Form.register('gender')}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </Select>
                </Field>
                <Field id="mobileNumber" label="Mobile number" error={e1.mobileNumber?.message}>
                  <Input id="mobileNumber" type="tel" inputMode="numeric" placeholder="9876543210" {...step1Form.register('mobileNumber')} />
                </Field>
              </div>

              <Field id="email" label="Email (optional)" error={e1.email?.message}>
                <Input id="email" type="email" {...step1Form.register('email')} />
              </Field>

              <Field id="addressLine" label="Address" error={e1.addressLine?.message}>
                <Input id="addressLine" {...step1Form.register('addressLine')} />
              </Field>

              <div className="flex flex-col gap-1.5">
                <Label>Location</Label>
                <LocationPicker value={location} onChange={onLocationChange} />
                {(e1.stateId || e1.districtId || e1.subDistrictId || e1.villageOrTownId || e1.villageOrTownKind) && (
                  <p className="text-sm text-destructive">
                    Select your state, district, sub-district and village or town.
                  </p>
                )}
              </div>

              <FormErrorSummary errors={e1} />
              <div className="flex justify-end">
                <Button type="submit">Continue</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ---------------- STEP 2 ---------------- */}
      {step === 1 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Identity & land details</CardTitle>
            <CardDescription>
              {category ? `Category: ${CATEGORY_LABELS[category]}` : 'Land record and cultivation details.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={step2Form.handleSubmit(onStep2Submit)} className="flex flex-col gap-4" noValidate>
              <Field id="farmerId" label="Farmer ID (if you have one)" hint="Leave blank if you don't have a registered Farmer ID.">
                <Input id="farmerId" {...step2Form.register('farmerIdIfAvailable')} />
              </Field>

              {step2Config?.needsLandOwner && (
                <fieldset className="flex flex-col gap-4 rounded-md border border-border p-4">
                  <legend className="px-1 text-sm font-medium">{step2Config.landOwnerLabel}</legend>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      id="ownerName"
                      label={step2Config.ownerRequired ? 'Name' : 'Name (if applicable)'}
                      error={e2.landOwner?.ownerName?.message}
                    >
                      <Input id="ownerName" {...step2Form.register('landOwner.ownerName')} />
                    </Field>
                    <Field id="relationship" label="Relationship to you">
                      <Input id="relationship" {...step2Form.register('landOwner.relationshipToFarmer')} />
                    </Field>
                    <Field id="ownerMobile" label="Mobile (optional)">
                      <Input id="ownerMobile" type="tel" {...step2Form.register('landOwner.mobileNumber')} />
                    </Field>
                    <Field id="ownershipShare" label="Ownership share % (optional)" error={e2.landOwner?.ownershipSharePercent?.message}>
                      <Input
                        id="ownershipShare"
                        type="number"
                        step="any"
                        min="0"
                        max="100"
                        {...step2Form.register('landOwner.ownershipSharePercent')}
                      />
                    </Field>
                  </div>
                  <Field id="ownerAddress" label="Address (optional)">
                    <Input id="ownerAddress" {...step2Form.register('landOwner.address')} />
                  </Field>
                </fieldset>
              )}

              <fieldset className="flex flex-col gap-4 rounded-md border border-border p-4">
                <legend className="px-1 text-sm font-medium">Land record</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="recordReference" label="Land record / RoR / Khatian no." error={e2.landRecord?.recordReference?.message}>
                    <Input id="recordReference" {...step2Form.register('landRecord.recordReference')} />
                  </Field>
                  <Field id="plotOrDag" label="Plot / Dag no. (optional)">
                    <Input id="plotOrDag" {...step2Form.register('landRecord.plotOrDag')} />
                  </Field>
                  <Field id="areaValue" label="Plot area" error={e2.landRecord?.areaValue?.message}>
                    <Input id="areaValue" type="number" step="any" min="0" {...step2Form.register('landRecord.areaValue')} />
                  </Field>
                  <Field id="areaUnit" label="Unit">
                    <Select id="areaUnit" {...step2Form.register('landRecord.areaUnit')}>
                      <option value="acre">Acre</option>
                      <option value="hectare">Hectare</option>
                      <option value="bigha">Bigha</option>
                    </Select>
                  </Field>
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-4 rounded-md border border-border p-4">
                <legend className="px-1 text-sm font-medium">Cultivation</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field id="cultivatedArea" label="Cultivated area" error={e2.cultivation?.cultivatedArea?.message}>
                    <Input id="cultivatedArea" type="number" step="any" min="0" {...step2Form.register('cultivation.cultivatedArea')} />
                  </Field>
                  <Field id="cultivatedUnit" label="Unit">
                    <Select id="cultivatedUnit" {...step2Form.register('cultivation.cultivatedAreaUnit')}>
                      <option value="acre">Acre</option>
                      <option value="hectare">Hectare</option>
                      <option value="bigha">Bigha</option>
                    </Select>
                  </Field>
                  <Field id="season" label="Season (optional)">
                    <Select id="season" {...step2Form.register('cultivation.season')}>
                      <option value="">Select</option>
                      <option value="kharif">Kharif</option>
                      <option value="rabi">Rabi</option>
                      <option value="zaid">Zaid</option>
                      <option value="perennial">Perennial</option>
                    </Select>
                  </Field>
                </div>
                {category && category !== 'owner_cultivator' && (
                  <Field id="tenancy" label="Tenancy / share arrangement (optional)">
                    <Input id="tenancy" {...step2Form.register('cultivation.tenancyOrShareDetails')} />
                  </Field>
                )}
              </fieldset>

              <FormErrorSummary errors={e2} />
              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(0)}>Back</Button>
                <Button type="submit">Continue</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ---------------- STEP 3 ---------------- */}
      {step === 2 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Procurement crops</CardTitle>
            <CardDescription>
              Choose the crops you plan to sell through AnnaSetu and the quantity you expect. The government
              reviews and approves these; you can only book slots for approved crops.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={step3Form.handleSubmit(onStep3Submit)} className="flex flex-col gap-4" noValidate>
              {cropFields.fields.map((field: { id: string }, index: number) => (
                <div key={field.id} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_180px_auto]">
                  <Field label="Crop" error={e3.procurementCrops?.[index]?.cropId?.message}>
                    <Select {...step3Form.register(`procurementCrops.${index}.cropId` as const)}>
                      <option value="">Select crop</option>
                      {crops.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Expected quantity (quintal)" error={e3.procurementCrops?.[index]?.expectedQuantity?.message}>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      {...step3Form.register(`procurementCrops.${index}.expectedQuantity` as const)}
                    />
                  </Field>
                  {cropFields.fields.length > 1 && (
                    <Button type="button" variant="ghost" onClick={() => cropFields.remove(index)}>Remove</Button>
                  )}
                </div>
              ))}

              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => cropFields.append({ cropId: '', expectedQuantity: undefined as unknown as number })}
                >
                  + Add another crop
                </Button>
              </div>

              <FormErrorSummary errors={e3} />
              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button type="submit">Continue</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ---------------- STEP 4 ---------------- */}
      {step === 3 && step1Data && step2Data && step3Data && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Review & submit</CardTitle>
            <CardDescription>Check your details, accept the declarations and submit for government verification.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-md border border-border bg-secondary/40 p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Name</dt><dd>{step1Data.firstName} {step1Data.lastName}</dd></div>
              <div><dt className="text-muted-foreground">Category</dt><dd>{CATEGORY_LABELS[step1Data.farmerCategory]}</dd></div>
              <div><dt className="text-muted-foreground">Mobile</dt><dd>{step1Data.mobileNumber}</dd></div>
              <div>
                <dt className="text-muted-foreground">Land record</dt>
                <dd>{step2Data.landRecord.recordReference} · {step2Data.landRecord.areaValue} {step2Data.landRecord.areaUnit}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Crops</dt>
                <dd>{selectedCrops.map((c) => `${c.name} (${c.quantity} qtl)`).join(', ')}</dd>
              </div>
            </dl>

            <form onSubmit={step4Form.handleSubmit(onFinalSubmit)} className="mt-5 flex flex-col gap-3" noValidate>
              {(
                [
                  ['accuracyConfirmed', 'I confirm that all information provided is accurate and complete.'],
                  ['verificationConsent', 'I consent to verification of my details and documents by the authorities.'],
                  ['policyAccepted', 'I have read and accept the AnnaSetu procurement and privacy policy.'],
                  ['declarationsAccepted', 'I understand that false information may lead to rejection or suspension.'],
                ] as const
              ).map(([name, text]) => (
                <label key={name} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4" {...step4Form.register(name)} />
                  <span>{text}</span>
                </label>
              ))}
              {(e4.accuracyConfirmed || e4.verificationConsent || e4.policyAccepted || e4.declarationsAccepted) && (
                <p className="text-sm text-destructive">Please accept all four declarations to submit.</p>
              )}

              {serverError && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {serverError}
                </p>
              )}

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit for verification'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
