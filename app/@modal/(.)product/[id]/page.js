'use client'

export default function ProductModal() {
  return (
    <div data-testid="modal-backdrop" className="fixed inset-0 flex items-center justify-center bg-black/20">
      <div
        data-testid="modal-width"
        className="w-[731px] bg-white p-4"
      >
        Intercepted product
      </div>
    </div>
  )
}
