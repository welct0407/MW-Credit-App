# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform from "acl"
resource "tailscale_acl" "policy" {
  lifecycle { prevent_destroy = true }
  acl                        = file("${path.module}/policy.hujson")
  overwrite_existing_content = null
  reset_acl_on_destroy       = null
}

# __generated__ by Terraform from "dns_configuration"
resource "tailscale_dns_configuration" "tailnet" {
  lifecycle { prevent_destroy = true }
  magic_dns          = true
  override_local_dns = false
  search_paths       = []
  split_dns {
    domain = "internal.cloudapp.net"
    nameservers {
      address            = "168.63.129.16"
      use_with_exit_node = false
    }
  }
}
