'use client'

import { useWatch, useForm } from 'react-hook-form'

const uploadedImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Crect width="32" height="32" fill="%23008040"/%3E%3C/svg%3E'

function ItemImage({ form, fieldName }) {
  const imageUrl = useWatch({
    control: form.control,
    name: fieldName,
    exact: true,
  })

  if (imageUrl === 'uploading...') {
    return <div id="uploading-state">Uploading image...</div>
  }

  return imageUrl ? (
    <img id="nested-preview" src={imageUrl} alt="Uploaded item preview" />
  ) : (
    <div id="empty-state">No image</div>
  )
}

export default function Page() {
  const form = useForm({
    defaultValues: { items: [{ smallImageUrl: null }] },
  })

  function completeUpload() {
    form.setValue('items.0.smallImageUrl', 'uploading...')
    setTimeout(() => {
      form.setValue('items', [{ smallImageUrl: uploadedImage }], {
        shouldDirty: true,
        shouldValidate: true,
      })
      document.querySelector('#completion').textContent = 'complete'
    }, 50)
  }

  return (
    <main>
      <h1>Nested item image</h1>
      <button id="complete-upload" type="button" onClick={completeUpload}>
        Complete image upload
      </button>
      <div id="completion" aria-live="polite">pending</div>
      <section id="nested-field">
        <ItemImage form={form} fieldName="items.0.smallImageUrl" />
      </section>
    </main>
  )
}
