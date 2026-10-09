export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function publicError(error: unknown): { code: string; message: string } {
  return error instanceof AppError
    ? { code: error.code, message: error.message }
    : {
        code: "PROCESSING_FAILED",
        message:
          "Przetwarzanie nie powiodło się. Spróbuj ponownie lub wybierz inny plik.",
      };
}
