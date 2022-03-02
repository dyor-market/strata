import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  Box,
  Container,
  Flex,
  Stack,
  Heading,
  Text,
  Button,
  Link,
} from "@chakra-ui/react";

export const Bootstrapper = () => (
  <Box w="full" bg="gray.900" color="white">
    <Container maxW="container.lg">
      <Flex
        align="center"
        justify={{
          base: "center",
          md: "space-between",
          xl: "space-between",
        }}
        direction={{ base: "column-reverse", md: "row" }}
        wrap="nowrap"
        py={20}
      >
        <Box>Image here</Box>
        <Stack
          gap={2}
          w={{ base: "80%", md: "45%" }}
          align={["center", "center", "flex-start", "flex-start"]}
        >
          <Text fontSize="sm" fontWeight="semibold" color="cyan.500">
            AVOIDING BOTS
          </Text>
          <Text fontSize="3xl" fontWeight="bold">
            Liquidity Bootstrapper
            <br />
            Curve{" "}
            <Text as="span" fontWeight="normal">
              (LBC)
            </Text>
          </Text>
          <Text fontSize="md">
            Strata allows you to bootstrap liquidity by selling tokens with a
            dynamic price discovery mechanism. This style of sale is done by
            starting with a high price that lowers over time and increases with
            every purchase.
          </Text>
          <Stack direction="row" gap={2} w="full">
            <Button
              isFullWidth
              colorScheme="orange"
              variant="outline"
              textColor="white"
              borderColor="orange.500"
              _hover={{ bg: "orange.500", textDecoration: "none" }}
              as={Link}
              href="/lbc/new"
            >
              Create LBC
            </Button>
            <Button
              isFullWidth
              variant="link"
              as={Link}
              href="/docs/lbc"
              color="white"
            >
              How it Works
            </Button>
          </Stack>
        </Stack>
      </Flex>
    </Container>
  </Box>
);