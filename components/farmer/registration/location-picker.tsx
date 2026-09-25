'use client';

import { useEffect, useState } from 'react';
import { getStates, getDistricts, getSubDistricts, getVillagesAndTowns } from '@/services/location/location-service';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

type Option = { id: string; name: string };
type VillageOrTown = Option & { kind: 'village' | 'town' };

export interface LocationValue {
  stateId: string;
  districtId: string;
  subDistrictId: string;
  villageOrTownId: string;
  villageOrTownKind: 'village' | 'town' | '';
}

export const EMPTY_LOCATION: LocationValue = {
  stateId: '',
  districtId: '',
  subDistrictId: '',
  villageOrTownId: '',
  villageOrTownKind: '',
};

/** Signature of react-hook-form's setValue, narrowed to what location syncing needs. */
export type SetFormValue = (name: string, value: string, options?: { shouldValidate?: boolean }) => void;

/**
 * The LocationPicker keeps its own state, so the parent form's react-hook-form
 * values never contained stateId/districtId/... and a schema that requires
 * them could never validate — the form's submit button silently did nothing.
 * Call this from the picker's onChange to mirror the selection into the form.
 * (Use the form's `setValue` via `(n, v, o) => form.setValue(n as never, v as never, o)`.)
 */
export function syncLocationToForm(setFormValue: SetFormValue, value: LocationValue, validate = false) {
  const options = { shouldValidate: validate };
  setFormValue('stateId', value.stateId, options);
  setFormValue('districtId', value.districtId, options);
  setFormValue('subDistrictId', value.subDistrictId, options);
  setFormValue('villageOrTownId', value.villageOrTownId, options);
  setFormValue('villageOrTownKind', value.villageOrTownKind, options);
}

type Level = 'district' | 'subDistrict' | 'village';

export function LocationPicker({
  value,
  onChange,
  level = 'village',
}: {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  /** How deep to go: district-only (help form), sub-district (centres/CSC), or full village/town. */
  level?: Level;
}) {
  const [states, setStates] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [subDistricts, setSubDistricts] = useState<Option[]>([]);
  const [villagesAndTowns, setVillagesAndTowns] = useState<VillageOrTown[]>([]);

  useEffect(() => {
    getStates().then(setStates);
  }, []);

  useEffect(() => {
    if (!value.stateId) {
      setDistricts([]);
      return;
    }
    getDistricts(value.stateId).then(setDistricts);
  }, [value.stateId]);

  useEffect(() => {
    if (!value.districtId || level === 'district') {
      setSubDistricts([]);
      return;
    }
    getSubDistricts(value.districtId).then(setSubDistricts);
  }, [value.districtId, level]);

  useEffect(() => {
    if (!value.subDistrictId || level !== 'village') {
      setVillagesAndTowns([]);
      return;
    }
    getVillagesAndTowns(value.subDistrictId).then(setVillagesAndTowns);
  }, [value.subDistrictId, level]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label>State</Label>
        <Select
          value={value.stateId}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onChange({ ...EMPTY_LOCATION, stateId: e.target.value })
          }
        >
          <option value="">Select state</option>
          {states.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>District</Label>
        <Select
          value={value.districtId}
          disabled={!value.stateId}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onChange({ ...EMPTY_LOCATION, stateId: value.stateId, districtId: e.target.value })
          }
        >
          <option value="">Select district</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </div>

      {level !== 'district' && (
        <div className="flex flex-col gap-1.5">
          <Label>Sub-district / Block</Label>
          <Select
            value={value.subDistrictId}
            disabled={!value.districtId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              onChange({
                ...EMPTY_LOCATION,
                stateId: value.stateId,
                districtId: value.districtId,
                subDistrictId: e.target.value,
              })
            }
          >
            <option value="">Select sub-district</option>
            {subDistricts.map((sd) => (
              <option key={sd.id} value={sd.id}>{sd.name}</option>
            ))}
          </Select>
        </div>
      )}

      {level === 'village' && (
        <div className="flex flex-col gap-1.5">
          <Label>Village / Town</Label>
          <Select
            value={value.villageOrTownId}
            disabled={!value.subDistrictId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              const match = villagesAndTowns.find((v) => v.id === e.target.value);
              onChange({ ...value, villageOrTownId: e.target.value, villageOrTownKind: match?.kind ?? '' });
            }}
          >
            <option value="">Select village/town</option>
            {villagesAndTowns.map((v) => (
              <option key={v.id} value={v.id}>{v.name} {v.kind === 'town' ? '(Town)' : ''}</option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
