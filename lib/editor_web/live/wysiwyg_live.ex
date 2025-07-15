defmodule EditorWeb.WYSIWYGLive do
  use EditorWeb, :live_view

  def handle_info({:upload_complete, response}, socket) do
    IO.puts("Received upload_complete: #{inspect(response)}")
    {:noreply, push_event(socket, "upload_complete", response)}
  end

  def handle_info({:upload_error, error}, socket) do
    IO.puts("Received upload_error: #{inspect(error)}")
    {:noreply, push_event(socket, "upload_error", error)}
  end

  def handle_info(info, socket) do
    IO.puts("Received info: #{inspect(info)}")
    {:noreply, socket}
  end

  def mount(_params, _session, socket) do
    assigns = [
      page_title: "WYSIWYG",
      formData: []
    ]

    {:ok, socket |> assign(assigns)}
  end

  def handle_event("show_flash", %{"type" => type, "message" => message}, socket) do
    {:noreply, put_flash(socket, String.to_atom(type), message)}
  end

  def handle_event("empty_content_warning", _params, socket) do
    {:noreply, put_flash(socket, :info, "Content cannot be empty")}
  end

  def handle_event("auto_save", params, socket) do
    dbg(params)
    {:noreply, socket}
  end

  def handle_event(event, params, socket) do
    IO.puts("Unhandled event: #{event}")
    dbg("Event params", params)
    {:noreply, socket}
  end
end
