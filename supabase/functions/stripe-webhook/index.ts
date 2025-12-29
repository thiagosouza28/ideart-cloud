import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    
    // If we have a webhook secret configured, verify the signature
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    let event: Stripe.Event;
    
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      logStep("Webhook signature verified");
    } else {
      // For testing without signature verification
      event = JSON.parse(body) as Stripe.Event;
      logStep("Webhook received without signature verification (testing mode)");
    }

    logStep("Event type", { type: event.type });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("Checkout session completed", { sessionId: session.id });

        if (session.mode === "subscription" && session.subscription) {
          const companyId = session.metadata?.company_id;
          const planId = session.metadata?.plan_id;
          
          if (companyId && planId) {
            // Get the subscription details
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            
            // Update company with subscription info
            const { error } = await supabaseClient
              .from('companies')
              .update({
                plan_id: planId,
                stripe_subscription_id: subscription.id,
                subscription_status: 'active',
                subscription_start_date: new Date(subscription.current_period_start * 1000).toISOString(),
                subscription_end_date: new Date(subscription.current_period_end * 1000).toISOString(),
              })
              .eq('id', companyId);

            if (error) {
              logStep("Error updating company", { error: error.message });
            } else {
              logStep("Company subscription updated", { companyId, planId });
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription updated", { subscriptionId: subscription.id, status: subscription.status });

        // Find company by subscription ID
        const { data: company } = await supabaseClient
          .from('companies')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (company) {
          const updateData: any = {
            subscription_status: subscription.status,
            subscription_end_date: new Date(subscription.current_period_end * 1000).toISOString(),
          };

          // If subscription is canceled, update status
          if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
            updateData.subscription_status = subscription.status;
          }

          await supabaseClient
            .from('companies')
            .update(updateData)
            .eq('id', company.id);

          logStep("Company subscription status updated", { companyId: company.id, status: subscription.status });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription deleted", { subscriptionId: subscription.id });

        // Find company by subscription ID
        const { data: company } = await supabaseClient
          .from('companies')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (company) {
          await supabaseClient
            .from('companies')
            .update({
              subscription_status: 'canceled',
              stripe_subscription_id: null,
            })
            .eq('id', company.id);

          logStep("Company subscription canceled", { companyId: company.id });
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        logStep("Invoice paid", { invoiceId: invoice.id });

        if (invoice.subscription) {
          const { data: company } = await supabaseClient
            .from('companies')
            .select('id')
            .eq('stripe_subscription_id', invoice.subscription as string)
            .single();

          if (company) {
            // Update subscription end date based on paid invoice
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
            
            await supabaseClient
              .from('companies')
              .update({
                subscription_status: 'active',
                subscription_end_date: new Date(subscription.current_period_end * 1000).toISOString(),
              })
              .eq('id', company.id);

            logStep("Company subscription renewed", { companyId: company.id });
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        logStep("Invoice payment failed", { invoiceId: invoice.id });

        if (invoice.subscription) {
          const { data: company } = await supabaseClient
            .from('companies')
            .select('id')
            .eq('stripe_subscription_id', invoice.subscription as string)
            .single();

          if (company) {
            await supabaseClient
              .from('companies')
              .update({ subscription_status: 'past_due' })
              .eq('id', company.id);

            logStep("Company subscription marked as past due", { companyId: company.id });
          }
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }
});
