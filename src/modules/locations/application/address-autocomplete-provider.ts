import type { AddressSuggestion } from "../domain/types";

export interface AddressAutocompleteProvider {
  autocomplete(query: string): Promise<readonly AddressSuggestion[]>;
}
