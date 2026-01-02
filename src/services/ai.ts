import { invokeEdgeFunction } from "@/services/edgeFunctions";

export type ProductDescriptionResponse = {
  short_description: string;
  long_description: string;
};

export async function generateProductDescription(name: string) {
  return invokeEdgeFunction<ProductDescriptionResponse>(
    "generate-product-description",
    { name },
  );
}
