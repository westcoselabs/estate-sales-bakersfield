import type { LocationInput, ValidatedLocation } from "../domain/types";

export interface LocationProvider {
  validate(input: LocationInput): Promise<ValidatedLocation>;
}
