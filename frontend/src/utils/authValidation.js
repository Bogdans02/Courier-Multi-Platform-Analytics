export function validateCredentials(email, password) {
  const normalizedEmail = email.trim();
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return 'Podaj poprawny adres e-mail.';
  }
  if (password.length < 8 || !password.trim()) {
    return 'Hasło musi mieć co najmniej 8 znaków i nie może składać się z samych spacji.';
  }
  if (new TextEncoder().encode(password).length > 72) {
    return 'Hasło jest zbyt długie. Użyj krótszego hasła.';
  }
  return '';
}
