defmodule EditorWeb.PageController do
  use EditorWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
