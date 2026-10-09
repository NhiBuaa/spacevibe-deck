/** The quiet tag on a group whose changes reach only sessions started afterwards. */
export function NewSessionsTag() {
  return (
    <span class="srd-tag" title="Running sessions keep what they started with">
      new sessions
    </span>
  );
}
