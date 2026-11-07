import { getServerUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { unauthorized, handleRoute, ok, parseBody } from "@/lib/api";
import { createOrderSchema } from "@/lib/contracts";
import { createOrderFor } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** GET /api/orders — the signed-in buyer's order history. */
export async function GET() {
  return handleRoute(async () => {
    const user = await getServerUser();
    if (!user) throw unauthorized();
    const admin = getAdminClient();
    if (!admin) {
      return Response.json(
        { error: { code: "unavailable", message: "Supabase is not configured." } },
        { status: 503 }
      );
    }
    const { data, error } = await admin
      .from("orders")
      .select(
        "id, dataset_id, custom_request_id, amount, currency, payment_status, created_at, dataset:datasets(name, slug, format)"
      )
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return ok({ orders: data ?? [] });
  });
}

/** POST /api/orders — create a pending order for a dataset or quoted custom
 *  request. The price is always taken from the database, never the client. */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await getServerUser();
    if (!user) throw unauthorized();
    const body = await parseBody(request, createOrderSchema);
    if (body.dataset_id && body.custom_request_id) {
      return Response.json(
        { error: { code: "validation_error", message: "Provide either dataset_id or custom_request_id." } },
        { status: 400 }
      );
    }
    const order = await createOrderFor(user.id, {
      datasetId: body.dataset_id,
      customRequestId: body.custom_request_id,
    });
    return ok(
      {
        order: {
          id: order.id,
          dataset_id: order.dataset_id,
          custom_request_id: order.custom_request_id,
          amount: order.amount,
          currency: order.currency,
          payment_status: order.payment_status,
        },
      },
      201
    );
  });
}
