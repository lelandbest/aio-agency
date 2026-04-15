import React, { useRef, useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';

const RichTextEditor = ({ 
  value, 
  onChange, 
  placeholder = 'Type here...',
  minHeight = 200,
  tools = 'full'
}) => {
  const editorRef = useRef(null);
  const [loading, setLoading] = useState(true);

  const toolbar = tools === 'full' 
    ? 'undo redo | formatselect | bold italic underline strikethrough | alignleft aligncenter alignright | bullist numlist outdent indent | link image table | removeformat code'
    : 'undo redo | bold italic | bullist numlist | removeformat';

  return (
    <div className="rich-text-editor-container w-full h-full relative" style={{ minHeight }}>
      {loading && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-[#1e293b] z-10"
          style={{ minHeight }}
        >
          <span className="text-slate-500 text-xs">Loading...</span>
        </div>
      )}
      <Editor
        tinymceScriptSrc="https://cdnjs.cloudflare.com/ajax/libs/tinymce/6.8.3/tinymce.min.js"
        ref={editorRef}
        value={value || ''}
        onEditorChange={(content) => onChange(content)}
        onInit={() => setLoading(false)}
        init={{
          height: '100%',
          min_height: minHeight,
          menubar: false,
          placeholder: placeholder,
          content_style: `
            html, body { background-color: #1e293b !important; color: #e2e8f0 !important; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; padding: 12px; margin: 0; }
            p { margin: 0 0 8px 0; }
            h1, h2, h3 { margin: 16px 0 8px 0; }
            h1 { font-size: 1.5rem; }
            h2 { font-size: 1.25rem; }
            h3 { font-size: 1.1rem; }
            .mce-content-body { background-color: #1e293b !important; color: #e2e8f0 !important; }
          `,
          skin: 'oxide-dark',
          content_css: 'dark',
          plugins: [
            'advlist', 'autolink', 'lists', 'link', 'image', 'table', 
            'charmap', 'preview', 'searchreplace', 'visualblocks', 'code',
            'fullscreen', 'insertdatetime', 'media', 'help'
          ],
          toolbar: toolbar,
          branding: false,
          statusbar: false,
          resize: true,
          promotion: false,
          entity_encoding: 'raw',
          formats: {
            underline: { inline: 'u' },
            strikethrough: { inline: 's' }
          },
          style_formats: [
            { title: 'Headers', items: [
              { title: 'H1', format: 'h1' },
              { title: 'H2', format: 'h2' },
              { title: 'H3', format: 'h3' },
            ]},
            { title: 'Inline', items: [
              { title: 'Bold', format: 'bold' },
              { title: 'Italic', format: 'italic' },
              { title: 'Underline', format: 'underline' },
              { title: 'Strikethrough', format: 'strikethrough' },
            ]},
            { title: 'Blocks', items: [
              { title: 'Paragraph', format: 'p' },
              { title: 'Blockquote', format: 'blockquote' },
              { title: 'Code', format: 'pre' },
            ]}
          ],
          quickbars_insert_toolbar: 'quicklink quickimage',
          quickbars_selection_toolbar: 'bold italic | quicklink',
          contextmenu: 'link image table',
        }}
      />
    </div>
  );
};

export default RichTextEditor;
