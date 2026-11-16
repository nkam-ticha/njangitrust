-- The priced parts of a payment as confirmed on the card (D22.2), so settlement books exactly
-- what was charged. Null on payments created before this column.
ALTER TABLE "PaymentIntent" ADD COLUMN "parts" JSONB;
