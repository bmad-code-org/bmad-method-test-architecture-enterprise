// EVAL FIXTURE. Production source for the clean trace corpus. It exists so the
// component test under tests/component has a real component to mount. Do not extend it.

export type TokenRow = {
  id: string;
  name: string;
  maskedPrefix: string;
  lastUsedAt: string | null;
};

export const TokenList = ({ tokens }: { tokens: TokenRow[] }) => (
  <table>
    <tbody>
      {tokens.map((token) => (
        <tr key={token.id}>
          <td>{token.name}</td>
          <td>{token.maskedPrefix}</td>
          <td>{token.lastUsedAt ? new Date(token.lastUsedAt).toISOString() : 'Never used'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
