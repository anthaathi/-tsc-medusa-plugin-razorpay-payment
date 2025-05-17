"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCustomerMetadataStep = void 0;
const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");
const utils_1 = require("@medusajs/framework/utils");
exports.updateCustomerMetadataStep = (0, workflows_sdk_1.createStep)("create-customer-step", async (input, { container }) => {
    const customerService = container.resolve(utils_1.Modules.CUSTOMER);
    // 1. create customer
    const customer = await customerService.retrieveCustomer(input.medusa_customer_id);
    // 2. create auth identity
    const { medusa_customer_id, ...rest } = input;
    const { razorpay } = rest;
    const registerResponse = await customerService.updateCustomers(medusa_customer_id, {
        metadata: {
            ...customer.metadata,
            razorpay: {
                ...razorpay,
            },
        },
    });
    // 4. do we want to authenticate immediately?
    //
    // const authenticationResponse = await authService.authenticate("emailpass", {
    //   body: {
    //     email: input.email,
    //     password: input.password,
    //   },
    // } as AuthenticationInput);
    return new workflows_sdk_1.StepResponse({ customer: customer, registerResponse }, customer.id);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLWN1c3RvbWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vc3JjL3dvcmtmbG93cy91cGRhdGUtcmF6b3JwYXktY3VzdG9tZXItbWV0YWRhdGEvc3RlcHMvdXBkYXRlLWN1c3RvbWVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHFFQUE2RTtBQUU3RSxxREFBb0Q7QUFHdkMsUUFBQSwwQkFBMEIsR0FBRyxJQUFBLDBCQUFVLEVBQ25ELHNCQUFzQixFQUN0QixLQUFLLEVBQUUsS0FBMEMsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7SUFDbkUsTUFBTSxlQUFlLEdBQTJCLFNBQVMsQ0FBQyxPQUFPLENBQ2hFLGVBQU8sQ0FBQyxRQUFRLENBQ2hCLENBQUM7SUFFRixxQkFBcUI7SUFDckIsTUFBTSxRQUFRLEdBQUcsTUFBTSxlQUFlLENBQUMsZ0JBQWdCLENBQ3RELEtBQUssQ0FBQyxrQkFBa0IsQ0FDeEIsQ0FBQztJQUVGLDBCQUEwQjtJQUMxQixNQUFNLEVBQUUsa0JBQWtCLEVBQUUsR0FBRyxJQUFJLEVBQUUsR0FBRyxLQUFLLENBQUM7SUFDOUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxHQUFHLElBQThCLENBQUM7SUFDcEQsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLGVBQWUsQ0FBQyxlQUFlLENBQzdELGtCQUFrQixFQUNsQjtRQUNDLFFBQVEsRUFBRTtZQUNULEdBQUcsUUFBUSxDQUFDLFFBQVE7WUFDcEIsUUFBUSxFQUFFO2dCQUNULEdBQUksUUFBOEM7YUFDbEQ7U0FDRDtLQUNELENBQ0QsQ0FBQztJQUVGLDZDQUE2QztJQUM3QyxFQUFFO0lBQ0YsK0VBQStFO0lBQy9FLFlBQVk7SUFDWiwwQkFBMEI7SUFDMUIsZ0NBQWdDO0lBQ2hDLE9BQU87SUFDUCw2QkFBNkI7SUFFN0IsT0FBTyxJQUFJLDRCQUFZLENBQ3RCLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxnQkFBZ0IsRUFBRSxFQUN4QyxRQUFRLENBQUMsRUFBRSxDQUNYLENBQUM7QUFDSCxDQUFDLENBQ0QsQ0FBQyJ9