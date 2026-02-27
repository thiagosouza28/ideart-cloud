import { invokeEdgeFunction } from "@/services/edgeFunctions";

export type ProductDescriptionResponse = {
  description: string;
  shortDescription: string;
  longDescription: string;
};

export type ProductDescriptionRequest = {
  name: string;
  category?: string;
  productType?: string;
  unit?: string;
  personalizationEnabled?: boolean;
  existingDescription?: string;
};

export async function generateProductDescription(payload: ProductDescriptionRequest) {
  return invokeEdgeFunction<ProductDescriptionResponse>(
    "generate-product-description",
    payload,
    { resetAuthOn401: false },
  );
}
