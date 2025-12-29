import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleYampiSubscriptionCheckout } from "../_shared/yampi-subscription.ts";

export const config = { verify_jwt: false };

serve(handleYampiSubscriptionCheckout);
