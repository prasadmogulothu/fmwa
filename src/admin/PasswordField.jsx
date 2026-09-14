import { useState } from 'react';

// type="button" is load-bearing: inside a form a bare button defaults to
// submit and would post the form on every peek.
export default function PasswordField({ value, onChange, ...rest }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="ad-pw">
      <input
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      <button
        type="button"
        className="ad-eye"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? '🙈' : '👁'}
      </button>
    </span>
  );
}
