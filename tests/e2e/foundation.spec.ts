import {test,expect} from "@playwright/test";
test("shows development foundation without financial entry",async({page})=>{await page.goto("/");await expect(page.getByRole("heading",{name:"MW Credit",exact:true})).toBeVisible();await expect(page.getByText("AppSheet continues operating in parallel")).toBeVisible();await expect(page.getByRole("button")).toHaveCount(0);});
