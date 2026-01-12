import { invokeEdgeFunction } from "@/services/edgeFunctions";

export type ProductDescriptionResponse = {
  shortDescription: string;
  longDescription: string;
};

export async function generateProductDescription(name: string) {
  return invokeEdgeFunction<ProductDescriptionResponse>(
    "generate-product-description",
    { name },
  );
}
