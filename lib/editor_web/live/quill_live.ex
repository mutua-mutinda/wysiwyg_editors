defmodule EditorWeb.QuillLive do
  use EditorWeb, :live_view

  def mount(_params, _session, socket) do
    assigns = [
      page_title: "Quill Editor",
      content: "",
      saved_content: nil,
      saved_html: nil
    ]

    {:ok, socket |> assign(assigns)}
  end

  def handle_event("show_flash", %{"type" => type, "message" => message}, socket) do
    {:noreply, put_flash(socket, String.to_atom(type), message)}
  end

  def handle_event("content_changed", %{"content" => content}, socket) do
    dbg(content)
    {:noreply, assign(socket, :content, content)}
  end

  def handle_event("save_content", %{"content" => content}, socket) do
    # Parse Delta format and convert to HTML for preview
    html_content = delta_to_html(content)

    # Here you would typically save to database
    # For now, we'll just store it in assigns
    {:noreply,
     socket
     |> assign(:saved_content, content)
     |> assign(:saved_html, html_content)
     |> put_flash(:info, "Content saved successfully!")}
  end

  def handle_event("auto_save", %{"content" => content}, socket) do
    # Auto-save functionality
    {:noreply, assign(socket, :content, content)}
  end

  def handle_event(_event, _params, socket) do
    # Handle any other events
    {:noreply, socket}
  end

  # Helper function to convert Delta to HTML (simplified version)
  defp delta_to_html(delta_json) do
    try do
      case Jason.decode(delta_json) do
        {:ok, %{"ops" => ops}} ->
          ops
          |> Enum.map(&op_to_html/1)
          |> Enum.join("")

        _ ->
          delta_json
      end
    rescue
      _ -> delta_json
    end
  end

  # Convert individual Delta operations to HTML
  defp op_to_html(%{"insert" => text}) when is_binary(text) do
    text
    |> String.replace("\n", "<br>")
    |> Phoenix.HTML.html_escape()
    |> Phoenix.HTML.safe_to_string()
  end

  defp op_to_html(%{"insert" => text, "attributes" => attrs}) when is_binary(text) do
    escaped_text =
      text
      |> String.replace("\n", "<br>")
      |> Phoenix.HTML.html_escape()
      |> Phoenix.HTML.safe_to_string()

    apply_attributes(escaped_text, attrs)
  end

  defp op_to_html(%{"insert" => %{"image" => url}}) do
    "<img src=\"#{url}\" alt=\"Image\" />"
  end

  defp op_to_html(_), do: ""

  # Apply formatting attributes
  defp apply_attributes(text, attrs) do
    Enum.reduce(attrs, text, fn
      {"bold", true}, acc -> "<strong>#{acc}</strong>"
      {"italic", true}, acc -> "<em>#{acc}</em>"
      {"underline", true}, acc -> "<u>#{acc}</u>"
      {"strike", true}, acc -> "<s>#{acc}</s>"
      {"code", true}, acc -> "<code>#{acc}</code>"
      {"link", url}, acc -> "<a href=\"#{url}\">#{acc}</a>"
      {"header", level}, acc -> "<h#{level}>#{acc}</h#{level}>"
      {"color", color}, acc -> "<span style=\"color: #{color};\">#{acc}</span>"
      {"background", color}, acc -> "<span style=\"background-color: #{color};\">#{acc}</span>"
      _, acc -> acc
    end)
  end
end
