-- Admin: delete place reservation request cards from the list
-- Safe to re-run after v1.5.

drop policy if exists "place_res_req_auth_delete" on public.place_reservation_requests;
create policy "place_res_req_auth_delete"
on public.place_reservation_requests
for delete
to authenticated
using (true);

grant delete on public.place_reservation_requests to authenticated;
