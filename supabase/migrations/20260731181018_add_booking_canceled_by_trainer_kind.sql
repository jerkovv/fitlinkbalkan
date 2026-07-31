ALTER TABLE public.notifications DROP CONSTRAINT notifications_kind_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
CHECK (kind = ANY (ARRAY[
  'booking_created','booking_canceled','booking_canceled_by_trainer',
  'workout_completed','message','program_assigned','nutrition_assigned',
  'message_from_trainer','membership_expiring','membership_expired',
  'membership_activated','membership_rejected','payment_request',
  'payment_marked','broadcast','generic','pr_set',
  'waitlist_promoted','waitlist_joined'
]));
